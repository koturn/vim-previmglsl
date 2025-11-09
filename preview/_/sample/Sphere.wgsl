struct Uniforms {
  resolution: vec2f,
  mouse: vec2f,
  time: f32
}
@binding(0) @group(0) var<uniform> uniforms: Uniforms;


//! Position of the camera.
const kCameraPos = vec3f(0.0, 0.0, 10.0);
//! Z-coordinate of the target screen.
const kScreenZ = 4.0;
//! Light direction.
const kLightDir = normalize(vec3f(0.0, 1.0, 1.0));
//! Light color.
const kLightCol = vec3f(1.0, 1.0, 1.0);

//! Maximum loop count.
const kMaxLoop = 128;
//! Minimum distance of the ray.
const kMinRayLength = 0.001;
//! Maximum distance of the ray.
const kMaxRayLength = 1000.0;
//! Marching Factor.
const kMarchingFactor = 1.0;

//! Specular Power.
const kSpecularPower = 50.0;
//! Specular Color.
const kSpecularColor = vec3f(0.5, 0.5, 0.5);


//! Color of the object.
const kAlbedo = vec3f(1.0, 1.0, 1.0);

@fragment
fn main(
  @builtin(position) fragPosition: vec4f,
  @location(0) fragCoord: vec2f
) -> @location(0) vec4f {
  let position = (fragCoord.xy * 2.0 - uniforms.resolution.xy) / min(uniforms.resolution.x, uniforms.resolution.y);
  let rayDir = normalize(vec3f(position, kScreenZ) - kCameraPos);

  // Distance.
  var d = 0.0;
  // Total distance.
  var t = 0.0;

  // Marching Loop.
  for (var i = 0; i < kMaxLoop; i++) {
    let rayPos = kCameraPos + rayDir * t;

    d = map(rayPos);
    t += d * kMarchingFactor;

    // Break this loop if the ray goes too far or collides.
    if (d < kMinRayLength || t > kMaxRayLength) {
      break;
    }
  }

  if (d > kMinRayLength) {
    discard;
  }

  let finalRayPos = kCameraPos + rayDir * t;
  let normal = getNormal(finalRayPos);

  let nDotL = dot(normal, kLightDir);

  let diffuse = vec3f(pow(0.5 * nDotL + 0.5, 2.0)) * kLightCol;

  let viewDir = normalize(kCameraPos - finalRayPos);
  let specular = pow(max(0.0, dot(normalize(kLightDir + viewDir), normal)), kSpecularPower) * kSpecularColor.xyz * kLightCol;

  return vec4f(diffuse * kAlbedo + specular, 1.0);
}


fn map(
  p: vec3f
) -> f32 {
  return sdSphere(p, 0.5);
}


fn sdSphere(
  p: vec3f,
  radius: f32
) -> f32 {
  return length(p) - radius;
}


fn getNormal(
  p: vec3f
) -> vec3f {
  const k = vec2f(1.0, -1.0);
  const h = 0.0001;
  const ks = array<vec3f, 4>(k.xyy, k.yxy, k.yyx, k.xxx);

  var normal = vec3f(0.0, 0.0, 0.0);

  for (var i = 0; i < 4; i++) {
    normal += ks[i] * map(p + ks[i] * h);
  }

  return normalize(normal);
}
