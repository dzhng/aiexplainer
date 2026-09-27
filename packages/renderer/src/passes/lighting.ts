/**
 * The one lighting model, as a WGSL snippet for any pass that shades surfaces: Lambert
 * diffuse and GGX specular (Smith-Schlick visibility, Schlick Fresnel) for the look's key,
 * rim and fill lights, a constant ambient for diffuse, and — for specular — a reflection of
 * the room's own wall and floor, computed analytically (no environment maps). Lights have
 * a small apparent size (a roughness floor) so highlights read as studio lights, not
 * pinpricks. No shadows in v1.
 * Templates that include it must pass `frameLayout` in their externals.
 */
export const LIGHTING_WGSL = /* wgsl */ `
const PI = 3.14159265;

struct Surface {
  baseColor: vec3f,
  metallic: f32,
  roughness: f32,
}

fn fresnelSchlick(f0: vec3f, cosTheta: f32) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(1.0 - cosTheta, 5.0);
}

/** Radiance the room sends along direction r: the wall gradient, whose bottom colour the floor fades into. */
fn roomRadiance(r: vec3f) -> vec3f {
  let look = frameLayout.$.look;
  return mix(look.wallBottom, look.wallTop, smoothstep(0.0, 0.6, r.y));
}

struct Shading {
  diffuse: vec3f,
  specular: vec3f,
}

/** Outgoing radiance toward the eye from a surface with normal n, view vector v. */
fn shadeSurface(surface: Surface, n: vec3f, v: vec3f) -> Shading {
  let look = frameLayout.$.look;
  let alpha = max(surface.roughness * surface.roughness, look.lightSize);
  let alpha2 = alpha * alpha;
  let k = (surface.roughness + 1.0) * (surface.roughness + 1.0) / 8.0;
  let f0 = mix(vec3f(0.04), surface.baseColor, surface.metallic);
  let diffuse = surface.baseColor * (1.0 - surface.metallic);
  let nDotV = max(dot(n, v), 1e-4);
  // Rough surfaces see a blurrier, dimmer room: Fresnel toward grazing, capped by roughness.
  let grazing = max(vec3f(1.0 - surface.roughness), f0) - f0;
  let reflectance = f0 + grazing * pow(1.0 - nDotV, 5.0);
  let reflection = roomRadiance(reflect(-v, n)) * look.reflection;
  var shading = Shading(look.ambient * diffuse, reflectance * reflection);
  for (var i = 0u; i < 3u; i++) {
    let light = look.lights[i];
    let l = light.direction;
    let nDotL = dot(n, l);
    if (nDotL <= 0.0) {
      continue;
    }
    let h = normalize(l + v);
    let nDotH = max(dot(n, h), 0.0);
    let d = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
    let distribution = alpha2 / (PI * d * d);
    let visibility = 1.0 / ((nDotL * (1.0 - k) + k) * (nDotV * (1.0 - k) + k) * 4.0);
    let fresnel = fresnelSchlick(f0, max(dot(h, v), 0.0));
    let specular = distribution * visibility * fresnel;
    let kd = (vec3f(1.0) - fresnel) * diffuse / PI;
    shading.diffuse += kd * light.radiance * nDotL;
    shading.specular += specular * light.radiance * nDotL;
  }
  return shading;
}
`;
