/**
 * `createRenderer`: owns the device, the registry and the resources, and updates each at its
 * own frequency — targets on resize, the scene (the environment room included) on `revision`
 * change, look numbers on `setLook`, glyphs when a text changes (the atlas once, growing as
 * new characters appear), and instances (part transforms), text placements, camera and
 * dynamics every frame. Drawing itself is `encodeFrame`.
 */
import { d, type TgpuBuffer, type TgpuRoot, type TgpuSampler, type TgpuTextureView } from "typegpu";
import type { AnyData } from "typegpu/data";
import { cameraMatrices, createCameraMatrices } from "./camera.ts";
import { withGpu, type Gpu } from "./device.ts";
import {
  describePasses,
  encodeFrame,
  type FrameLook,
  type FrameScene,
  type FrameTargets,
  type FrameText,
} from "./frame.ts";
import {
  Layer,
  type FrameInput,
  type FrameReceipt,
  type LookConfig,
  type Renderer,
} from "./frame-input.ts";
import {
  DYNAMICS_BYTES_PER_SLOT,
  packDynamics,
  FRAME_UNIFORM_BYTES,
  FrameUniform,
  Instance,
  INSTANCE_BYTES,
  LOOK_UNIFORM_BYTES,
  LookUniform,
  Material,
  MATERIAL_BYTES,
  packFrame,
  packLook,
  packMaterial,
  TEXT_GLYPH_BYTES,
  TextGlyph,
  TextItem,
  Vertex,
  VERTEX_BYTES,
} from "./pack.ts";
import { createBackgroundPipeline } from "./passes/background.ts";
import {
  bloomMipCount,
  bloomSourceLayout,
  createBloomPipelines,
  describeBloomChain,
} from "./passes/bloom.ts";
import { createGeometryPipelines } from "./passes/geometry.ts";
import { createTextPipeline, TextPacker, textLayout } from "./passes/text.ts";
import { createTonemapPipeline, postLayout } from "./passes/tonemap.ts";
import { DEPTH_FORMAT, frameLayout, HDR_FORMAT, SAMPLE_COUNT, sceneLayout } from "./pipeline.ts";
import { Registry, type Scope } from "./registry.ts";
import { compileScene, packInstances, type CompiledScene } from "./scene.ts";
import { ATLAS_SIZE, GlyphAtlas, loadFonts } from "./text/atlas.ts";
import { FrameTimer } from "./timing.ts";

/** The smallest glyph buffer, glyphs; it doubles from here when the texts need more. */
const MIN_GLYPHS = 256;

interface SceneResources extends FrameScene {
  revision: number;
  compiled: CompiledScene;
  text: TextPacker;
  instances: GPUBuffer;
  instanceF32: Float32Array<ArrayBuffer>;
  instanceU32: Uint32Array;
  dynamics: GPUBuffer;
  dynamicsData: Float32Array<ArrayBuffer>;
}

interface LookResources extends FrameLook {
  look: LookConfig;
}

/** The scene's text buffers, sized for `capacity` glyphs; rebuilt with the scene or to grow. */
interface TextResources extends FrameText {
  packer: TextPacker;
  capacity: number;
  glyphBuffer: GPUBuffer;
  itemBuffer: GPUBuffer;
}

function upload(root: TgpuRoot, buffer: TgpuBuffer<AnyData>, data: ArrayBufferView<ArrayBuffer>) {
  root.device.queue.writeBuffer(root.unwrap(buffer), 0, data);
}

/** One storage buffer of `Vertex` records and a matching index buffer. */
function uploadGeometry(
  root: TgpuRoot,
  scope: Scope,
  vertices: Float32Array<ArrayBuffer>,
  indices: Uint32Array<ArrayBuffer>,
) {
  const vertexBuffer = scope
    .buffer(d.arrayOf(Vertex, Math.max(1, (vertices.length * 4) / VERTEX_BYTES)))
    .$usage("storage");
  upload(root, vertexBuffer, vertices);
  const indexBuffer = scope.buffer(d.arrayOf(d.u32, Math.max(1, indices.length))).$usage("index");
  upload(root, indexBuffer, indices);
  return { vertexBuffer, indexBuffer };
}

function buildTargets(
  root: TgpuRoot,
  registry: Registry,
  linear: TgpuSampler,
  width: number,
  height: number,
  timer?: FrameTimer,
) {
  const scope = registry.scope();
  const size = [width, height] as const;
  const depth = scope
    .texture({ size, format: DEPTH_FORMAT, sampleCount: SAMPLE_COUNT })
    .$usage("render");
  const colourMs = scope
    .texture({ size, format: HDR_FORMAT, sampleCount: SAMPLE_COUNT })
    .$usage("render");
  const hdr = scope.texture({ size, format: HDR_FORMAT }).$usage("render", "sampled");

  // The bloom chain starts at half resolution.
  const bloomSize = [Math.max(1, width >> 1), Math.max(1, height >> 1)] as const;
  const mipLevelCount = bloomMipCount(bloomSize[0], bloomSize[1]);
  const bloom = scope
    .texture({ size: bloomSize, format: HDR_FORMAT, mipLevelCount })
    .$usage("render", "sampled");
  const level = (baseMipLevel: number) =>
    bloom.createView(d.texture2d(d.f32), { baseMipLevel, mipLevelCount: 1 });
  const source = (view: TgpuTextureView<d.WgslTexture2d<d.F32>>) =>
    root.unwrap(root.createBindGroup(bloomSourceLayout, { source: view, linear }));
  const mips = Array.from({ length: mipLevelCount }, (_, i) => ({
    render: root.unwrap(bloom).createView({ baseMipLevel: i, mipLevelCount: 1 }),
    source: source(level(i)),
  }));

  const targets: FrameTargets = {
    width,
    height,
    ...describePasses(
      root.unwrap(depth).createView(),
      root.unwrap(colourMs).createView(),
      root.unwrap(hdr).createView(),
      timer,
    ),
    postBindGroup: root.unwrap(root.createBindGroup(postLayout, { hdr, bloom: level(0), linear })),
    bloom: describeBloomChain(source(hdr.createView(d.texture2d(d.f32))), mips),
  };
  return { scope, targets };
}

function buildLook(
  root: TgpuRoot,
  registry: Registry,
  frame: TgpuBuffer<typeof FrameUniform> & { usableAsUniform: true },
  look: LookConfig,
) {
  const scope = registry.scope();
  const lookBuffer = scope.buffer(LookUniform).$usage("uniform");
  const data = new Float32Array(LOOK_UNIFORM_BYTES / 4);
  packLook(data, look);
  upload(root, lookBuffer, data);
  const value: LookResources = {
    look,
    frame: root.unwrap(root.createBindGroup(frameLayout, { frame, look: lookBuffer })),
  };
  return { scope, value };
}

/** Buffers for `packer`'s texts and room for `capacity` glyphs, with the glyphs uploaded. */
function buildText(
  root: TgpuRoot,
  registry: Registry,
  packer: TextPacker,
  atlas: TgpuTextureView<d.WgslTexture2d<d.F32>>,
  linear: TgpuSampler,
) {
  const scope = registry.scope();
  let capacity = MIN_GLYPHS;
  while (capacity < packer.glyphCount) capacity *= 2;
  const glyphs = scope.buffer(d.arrayOf(TextGlyph, capacity)).$usage("storage");
  const items = scope
    .buffer(d.arrayOf(TextItem, Math.max(1, packer.items.length)))
    .$usage("storage");
  const value: TextResources = {
    packer,
    capacity,
    glyphs: packer.glyphCount,
    glyphBuffer: root.unwrap(glyphs),
    itemBuffer: root.unwrap(items),
    bindGroup: root.unwrap(root.createBindGroup(textLayout, { glyphs, items, atlas, linear })),
  };
  uploadGlyphs(root.device, value);
  return { scope, value };
}

function uploadGlyphs(device: GPUDevice, text: TextResources): void {
  const { packer } = text;
  text.glyphs = packer.glyphCount;
  if (packer.glyphCount > 0)
    device.queue.writeBuffer(
      text.glyphBuffer,
      0,
      packer.glyphData,
      0,
      (packer.glyphCount * TEXT_GLYPH_BYTES) / 4,
    );
}

function buildScene(
  root: TgpuRoot,
  registry: Registry,
  input: FrameInput,
  look: LookConfig,
  atlas: GlyphAtlas,
) {
  const compiled = compileScene(input.scene, look);
  const scope = registry.scope();
  const { vertexBuffer, indexBuffer } = uploadGeometry(
    root,
    scope,
    compiled.vertices,
    compiled.indices,
  );

  const instanceCount = Math.max(1, compiled.instanceParts.length);
  const instances = scope.buffer(d.arrayOf(Instance, instanceCount)).$usage("storage");
  const instanceData = new ArrayBuffer(instanceCount * INSTANCE_BYTES);

  const materialNames = Object.keys(look.materials);
  const materials = scope.buffer(d.arrayOf(Material, materialNames.length)).$usage("storage");
  const materialData = new Float32Array((materialNames.length * MATERIAL_BYTES) / 4);
  materialNames.forEach((name, i) => packMaterial(materialData, i, look.materials[name]!));
  upload(root, materials, materialData);

  const dynamics = scope.buffer(d.arrayOf(d.vec4f, compiled.slotCount)).$usage("storage");
  const bindGroup = root.createBindGroup(sceneLayout, {
    vertices: vertexBuffer,
    instances,
    materials,
    dynamics,
  });

  const value: SceneResources = {
    revision: input.scene.revision,
    compiled,
    text: new TextPacker(input.scene, look, atlas),
    bindGroup: root.unwrap(bindGroup),
    indexBuffer: root.unwrap(indexBuffer),
    draws: compiled.draws,
    instances: root.unwrap(instances),
    instanceF32: new Float32Array(instanceData),
    instanceU32: new Uint32Array(instanceData),
    dynamics: root.unwrap(dynamics),
    dynamicsData: new Float32Array((compiled.slotCount * DYNAMICS_BYTES_PER_SLOT) / 4),
  };
  return { scope, value };
}

export interface RendererOptions {
  /** Measure whole-frame GPU time into `FrameReceipt.gpuMs` (needs `timestamp-query`). */
  timing?: boolean;
}

/**
 * The renderer on its own GPU device, or why there is none (no adapter, a refused device, or
 * a setup failure, after which the device is released): the caller shows the fallback.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  initialLook: LookConfig,
  options: RendererOptions = {},
): Promise<Renderer | { unsupported: string }> {
  return withGpu((gpu) => buildRenderer(gpu, canvas, initialLook, options));
}

async function buildRenderer(
  gpu: Gpu,
  canvas: HTMLCanvasElement,
  initialLook: LookConfig,
  options: RendererOptions,
): Promise<Renderer> {
  const { root, device, caps } = gpu;
  const context = root.configureContext({ canvas, format: caps.canvasFormat, alphaMode: "opaque" });
  const [geometry, background, bloom, tonemap, text] = await Promise.all([
    createGeometryPipelines(root),
    createBackgroundPipeline(root),
    createBloomPipelines(root),
    createTonemapPipeline(root, caps.canvasFormat),
    createTextPipeline(root),
    loadFonts(Object.values(initialLook.text)),
  ]);
  const pipelines = { geometry, background, bloom, tonemap, text };
  const linear = root.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const registry = new Registry(root);
  const fixed = registry.scope();
  const frameUniform = fixed.buffer(FrameUniform).$usage("uniform");
  const timer = options.timing && caps.timestampQuery ? new FrameTimer(device, fixed) : undefined;
  const frameData = new Float32Array(FRAME_UNIFORM_BYTES / 4);
  const gpuFrameUniform = root.unwrap(frameUniform);
  const atlasTexture = fixed.texture({ size: ATLAS_SIZE, format: "r8unorm" }).$usage("sampled");
  const atlas = new GlyphAtlas(device, root.unwrap(atlasTexture));
  const atlasView = atlasTexture.createView(d.texture2d(d.f32));

  const targets = registry.slot<FrameTargets>();
  const lookSlot = registry.slot<LookResources>();
  const scene = registry.slot<SceneResources>();
  const textSlot = registry.slot<TextResources>();
  const camera = createCameraMatrices();
  const receipt: FrameReceipt = {
    drawCalls: 0,
    triangles: 0,
    registry: { count: 0, bytes: 0 },
    gpuMs: null,
  };

  const setLook = (look: LookConfig) => {
    if (registry.disposed) return;
    const built = buildLook(root, registry, frameUniform, look);
    lookSlot.swap(built.scope, built.value);
    scene.clear();
  };

  const resize = () => {
    if (registry.disposed) return;
    const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
    const current = targets.value;
    if (current && current.width === width && current.height === height) return;
    canvas.width = width;
    canvas.height = height;
    const built = buildTargets(root, registry, linear, width, height, timer);
    targets.swap(built.scope, built.targets);
  };

  setLook(initialLook);
  resize();

  return {
    frame(input) {
      if (registry.disposed) {
        registry.stats(receipt.registry);
        return receipt;
      }
      const look = lookSlot.value!;
      let s = scene.value;
      if (!s || s.revision !== input.scene.revision) {
        const built = buildScene(root, registry, input, look.look, atlas);
        scene.swap(built.scope, built.value);
        s = built.value;
      }
      // Glyphs are laid out when a text changes; buffers follow the scene, or grow to fit.
      const glyphsChanged = s.text.layout();
      let text = textSlot.value;
      if (!text || text.packer !== s.text || s.text.glyphCount > text.capacity) {
        const built = buildText(root, registry, s.text, atlasView, linear);
        textSlot.swap(built.scope, built.value);
        text = built.value;
      } else if (glyphsChanged) uploadGlyphs(device, text);
      // Part transforms are per-frame data (bars grow, cards slide); repacking is allocation-free.
      packInstances(s.compiled, s.instanceF32, s.instanceU32);
      device.queue.writeBuffer(s.instances, 0, s.instanceF32);
      packDynamics(
        input.dynamics,
        s.compiled.slotCount,
        s.compiled.environmentSlot,
        s.dynamicsData,
      );
      device.queue.writeBuffer(s.dynamics, 0, s.dynamicsData);

      const t = targets.value!;
      cameraMatrices(input.camera, input.viewport, camera);
      const layers = input.debug?.layers ?? ~0;
      const bloomOn = input.debug?.bloom !== false;
      const emissive = layers & Layer.emissive ? 1 : 0;
      const flows = layers & Layer.flows ? 1 : 0;
      packFrame(
        frameData,
        camera,
        input.timeSec,
        t.width,
        t.height,
        emissive,
        bloomOn ? 1 : 0,
        flows,
      );
      device.queue.writeBuffer(gpuFrameUniform, 0, frameData);
      s.text.place(camera);
      device.queue.writeBuffer(text.itemBuffer, 0, s.text.itemData);

      const swapchain = context.getCurrentTexture().createView();
      const drawnText = layers & Layer.text ? text : null;
      encodeFrame(device, swapchain, pipelines, t, s, drawnText, look, bloomOn, receipt, timer);
      receipt.gpuMs = timer?.lastMs ?? null;
      registry.stats(receipt.registry);
      return receipt;
    },
    textRects(camera, out) {
      const s = scene.value;
      if (!s || registry.disposed) {
        out.length = 0;
        return out;
      }
      return s.text.rects(camera, out);
    },
    resize,
    setLook,
    dispose() {
      if (registry.disposed) return;
      registry.dispose();
      root.destroy();
    },
  };
}
