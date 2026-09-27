/**
 * `createRenderer`: owns the device, the registry and the resources, and updates each at its
 * own frequency — targets on resize, the scene on `revision` change, look numbers and the
 * room on `setLook`, instances on view change, camera and dynamics every frame. Drawing
 * itself is `encodeFrame`.
 */
import { d, type TgpuBuffer, type TgpuRoot } from "typegpu";
import type { AnyData } from "typegpu/data";
import { cameraMatrices, createCameraMatrices } from "./camera.ts";
import { initGpu } from "./device.ts";
import {
  describePasses,
  encodeFrame,
  type FrameLook,
  type FrameScene,
  type FrameTargets,
} from "./frame.ts";
import type { FrameInput, FrameReceipt, LookConfig, Renderer, ViewMode } from "./frame-input.ts";
import {
  DYNAMICS_BYTES_PER_SLOT,
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
  packVertices,
  Vertex,
  VERTEX_BYTES,
} from "./pack.ts";
import { createBackgroundPipeline } from "./passes/background.ts";
import { createGeometryPipelines } from "./passes/geometry.ts";
import { createRoomPipeline, roomGeometry, roomLayout } from "./passes/room.ts";
import { createTonemapPipeline, postLayout } from "./passes/tonemap.ts";
import { DEPTH_FORMAT, frameLayout, HDR_FORMAT, SAMPLE_COUNT, sceneLayout } from "./pipeline.ts";
import { Registry, type Scope } from "./registry.ts";
import { compileScene, packInstances, type CompiledScene } from "./scene.ts";

interface SceneResources extends FrameScene {
  revision: number;
  compiled: CompiledScene;
  instances: GPUBuffer;
  instanceF32: Float32Array<ArrayBuffer>;
  instanceU32: Uint32Array;
  dynamics: GPUBuffer;
  dynamicsData: Float32Array<ArrayBuffer>;
  view: { mode: ViewMode | null; t: number };
}

interface LookResources extends FrameLook {
  look: LookConfig;
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

function buildTargets(root: TgpuRoot, registry: Registry, width: number, height: number) {
  const scope = registry.scope();
  const size = [width, height] as const;
  const depth = scope
    .texture({ size, format: DEPTH_FORMAT, sampleCount: SAMPLE_COUNT })
    .$usage("render");
  const colourMs = scope
    .texture({ size, format: HDR_FORMAT, sampleCount: SAMPLE_COUNT })
    .$usage("render");
  const hdr = scope.texture({ size, format: HDR_FORMAT }).$usage("render", "sampled");
  const targets: FrameTargets = {
    width,
    height,
    ...describePasses(
      root.unwrap(depth).createView(),
      root.unwrap(colourMs).createView(),
      root.unwrap(hdr).createView(),
    ),
    postBindGroup: root.unwrap(root.createBindGroup(postLayout, { hdr })),
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
  const room = roomGeometry(look.room.radius);
  const roomVertices = new Float32Array(((room.positions.length / 3) * VERTEX_BYTES) / 4);
  packVertices(roomVertices, 0, room.positions, room.normals);
  const { vertexBuffer, indexBuffer } = uploadGeometry(
    root,
    scope,
    roomVertices,
    room.indices as Uint32Array<ArrayBuffer>,
  );
  const value: LookResources = {
    look,
    frame: root.unwrap(root.createBindGroup(frameLayout, { frame, look: lookBuffer })),
    room: {
      bindGroup: root.unwrap(root.createBindGroup(roomLayout, { vertices: vertexBuffer })),
      indexBuffer: root.unwrap(indexBuffer),
      indexCount: room.indices.length,
    },
  };
  return { scope, value };
}

function buildScene(root: TgpuRoot, registry: Registry, input: FrameInput, look: LookConfig) {
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
    bindGroup: root.unwrap(bindGroup),
    indexBuffer: root.unwrap(indexBuffer),
    draws: compiled.draws,
    instances: root.unwrap(instances),
    instanceF32: new Float32Array(instanceData),
    instanceU32: new Uint32Array(instanceData),
    dynamics: root.unwrap(dynamics),
    dynamicsData: new Float32Array((compiled.slotCount * DYNAMICS_BYTES_PER_SLOT) / 4),
    view: { mode: null, t: 0 },
  };
  return { scope, value };
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  initialLook: LookConfig,
): Promise<Renderer | { unsupported: string }> {
  const gpu = await initGpu();
  if ("unsupported" in gpu) return gpu;
  const { root, device, caps } = gpu;
  const context = root.configureContext({ canvas, format: caps.canvasFormat, alphaMode: "opaque" });
  const [geometry, background, room, tonemap] = await Promise.all([
    createGeometryPipelines(root),
    createBackgroundPipeline(root),
    createRoomPipeline(root),
    createTonemapPipeline(root, caps.canvasFormat),
  ]);
  const pipelines = { geometry, background, room, tonemap };

  const registry = new Registry(root);
  const frameUniform = registry.scope().buffer(FrameUniform).$usage("uniform");
  const frameData = new Float32Array(FRAME_UNIFORM_BYTES / 4);
  const gpuFrameUniform = root.unwrap(frameUniform);

  const targets = registry.slot<FrameTargets>();
  const lookSlot = registry.slot<LookResources>();
  const scene = registry.slot<SceneResources>();
  const camera = createCameraMatrices();
  const receipt: FrameReceipt = { drawCalls: 0, triangles: 0, registry: { count: 0, bytes: 0 } };

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
    const built = buildTargets(root, registry, width, height);
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
        const built = buildScene(root, registry, input, look.look);
        scene.swap(built.scope, built.value);
        s = built.value;
      }
      if (s.view.mode !== input.view.mode || s.view.t !== input.view.t) {
        packInstances(s.compiled, input.view, s.instanceF32, s.instanceU32);
        device.queue.writeBuffer(s.instances, 0, s.instanceF32);
        s.view.mode = input.view.mode;
        s.view.t = input.view.t;
      }
      const dyn = input.dynamics;
      for (let slot = 0; slot < s.compiled.slotCount; slot++) {
        s.dynamicsData[slot * 4] = dyn.intensity[slot] ?? 0;
        s.dynamicsData[slot * 4 + 1] = dyn.widthScale[slot] ?? 1;
        s.dynamicsData[slot * 4 + 2] = dyn.flowPhase[slot] ?? 0;
      }
      device.queue.writeBuffer(s.dynamics, 0, s.dynamicsData);

      const t = targets.value!;
      cameraMatrices(input.camera, input.viewport, camera);
      packFrame(frameData, camera, input.timeSec, t.width, t.height);
      device.queue.writeBuffer(gpuFrameUniform, 0, frameData);

      encodeFrame(device, context.getCurrentTexture().createView(), pipelines, t, s, look, receipt);
      registry.stats(receipt.registry);
      return receipt;
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
