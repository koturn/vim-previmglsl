struct Uniforms {
  time : f32,
  padding : f32,
  mouse : vec2<f32>,
  resolution : vec2<f32>
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;


//! Position of the camera.
const kCameraPos = vec3<f32>(0.0, 0.0, 10.0);
//! Z-coordinate of the target screen.
const kScreenZ = 4.0;
//! Light direction.
const kLightDir = normalize(vec3<f32>(0.0, 1.0, 1.0));
//! Light color.
const kLightCol = vec3<f32>(1.0, 1.0, 1.0);

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
const kSpecularColor = vec3<f32>(0.5, 0.5, 0.5);


//! Color of the object.
const kAlbedo = vec3(1.0, 1.0, 1.0);

@fragment
fn main(
  @builtin(position) fragPosition : vec4<f32>,
  @location(0) fragCoord : vec2<f32>
) -> @location(0) vec4<f32> {
  let position = (fragCoord.xy * 2.0 - uniforms.resolution.xy) / min(uniforms.resolution.x, uniforms.resolution.y);
  let rayDir = normalize(vec3<f32>(position, kScreenZ) - kCameraPos);

  // Distance.
  var d = 0.0;
  // Total distance.
  var t = 0.0;

  // Marching Loop.
  for (var i: i32 = 0; i < kMaxLoop; i++) {
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

  let diffuse = vec3<f32>(pow(0.5 * nDotL + 0.5, 2.0)) * kLightCol;

  let viewDir = normalize(kCameraPos - finalRayPos);
  let specular = pow(max(0.0, dot(normalize(kLightDir + viewDir), normal)), kSpecularPower) * kSpecularColor.xyz * kLightCol;

  return vec4<f32>(diffuse * kAlbedo + specular, 1.0);
}


fn map(
  p : vec3<f32>
) -> f32 {
  return sdSphere(p, 0.5);
}


fn sdSphere(
  p : vec3<f32>,
  radius : f32
) -> f32 {
  return length(p) - radius;
}


fn getNormal(
  p : vec3<f32>
) -> vec3<f32> {
  const h = 0.0001;
  const s = vec2<f32>(1.0, -1.0);
  const hs = h * s;

  return normalize(
    s.xyy * map(p + hs.xyy)
      + s.yxy * map(p + hs.yxy)
      + s.yyx * map(p + hs.yyx)
      + s.xxx * map(p + hs.xxx));
}
