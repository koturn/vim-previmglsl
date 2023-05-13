#version 300 es

/*!
 * @brief Template GLSL file for Ray Marching.
 *
 * @author koturn
 * @date 2023 05/10
 * @file Sphere.glsl
 * @version 0.1
 */
precision mediump float;

// vscode-glsl-canvas
// https://marketplace.visualstudio.com/items?itemName=circledev.glsl-canvas
#define VSCODE 1
// Shadertoy
// https://www.shadertoy.com/new#
#define SHADERTOY 2

// Platform switch.
#define PLATFORM VSCODE
// #define PLATFORM SHADERTOY


#if PLATFORM == SHADERTOY
#    define u_time iTime
#    define u_mouse iMouse
#    define u_resolution iResolution
#endif

#if PLATFORM == VSCODE
//! Elapsed seconds.
uniform float u_time;
//! Mouse position.
uniform vec2 u_mouse;
//! Screen resolution.
uniform vec2 u_resolution;
#endif


#if PLATFORM != SHADERTOY
//! Output color
out vec4 FragColor;
#endif


//! Position of the camera.
const vec3 kCameraPos = vec3(0.0, 0.0, 10.0);
//! Z-coordinate of the target screen.
const float kScreenZ = 4.0;
//! Light direction.
const vec3 kLightDir = normalize(vec3(0.0, 1.0, 1.0));
//! Light color.
const vec3 kLightCol = vec3(1.0, 1.0, 1.0);

//! Maximum loop count.
const int kMaxLoop = 128;
//! Minimum distance of the ray.
const float kMinRayLength = 0.001;
//! Maximum distance of the ray.
const float kMaxRayLength = 1000.0;
//! Marching Factor.
const float kMarchingFactor = 1.0;

//! Specular Power.
const float kSpecularPower = 50.0;
//! Specular Color.
const vec3 kSpecularColor = vec3(0.5, 0.5, 0.5);


//! Color of the object.
const vec3 kAlbedo = vec3(1.0, 1.0, 1.0);


#ifndef DOXYGEN
void mainImage(out vec4 fragColor, in vec2 fragCoord);
float map(vec3 p);
float sdSphere(vec3 p, float size);
vec3 getNormal(vec3 p);
float sq(float x);
#endif


#if PLATFORM != SHADERTOY
/*!
 * @brief Entry point of this fragment shader program.
 */
void main(void)
{
    mainImage(/* out */ FragColor, gl_FragCoord.xy);
}
#endif


/*!
 * @brief Body of fragment shader function.
 * @param [out] fragColor  Color of fragment.
 * @param [in] fragCoord  Coordinate of fragment.
 */
void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 position = (fragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec3 rayDir = normalize(vec3(position, kScreenZ) - kCameraPos);

    // Distance.
    float d = 0.0;
    // Total distance.
    float t = 0.0;

    // Marching Loop.
    for (int i = 0; i < kMaxLoop; i++) {
        vec3 rayPos = kCameraPos + rayDir * t;

        d = map(rayPos);
        t += d * kMarchingFactor;

        // Break this loop if the ray goes too far or collides.
        if (d < kMinRayLength || t > kMaxRayLength) {
            break;
        }
    }

    // Discard if it is determined that the ray is not in collision.
    if (d > kMinRayLength) {
#if PLATFORM == SHADERTOY
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
#else
        discard;
#endif
    }

    vec3 finalRayPos = kCameraPos + rayDir * t;
    vec3 normal = getNormal(finalRayPos);

    float nDotL = dot(normal, kLightDir);

    vec3 diffuse = vec3(sq(0.5 * nDotL + 0.5)) * kLightCol;

    vec3 viewDir = normalize(kCameraPos - finalRayPos);
    vec3 specular = pow(max(0.0, dot(normalize(kLightDir + viewDir), normal)), kSpecularPower) * kSpecularColor.xyz * kLightCol;

    fragColor = vec4(diffuse * kAlbedo + specular, 1.0);
}


/*!
 * @brief SDF (Signed Distance Function) of objects.
 * @param [in] p  Position of the tip of the ray.
 * @return Signed Distance to the objects.
 */
float map(vec3 p)
{
    return sdSphere(p, 0.5);
}


/*!
 * @brief SDF of Sphere.
 * @param [in] p  Position of the tip of the ray.
 * @param [in] radius  Radius of the sphere.
 * @return Signed Distance to the Sphere.
 */
float sdSphere(vec3 p, float radius)
{
    return length(p) - radius;
}


/*!
 * @brief Calculate normal of the objects.
 * @param [in] p  Position of the tip of the ray.
 * @return Normal of the objects.
 */
vec3 getNormal(vec3 p)
{
    const vec2 k = vec2(1.0, -1.0);
    const float h = 0.0001;
    const vec3[4] ks = vec3[](k.xyy, k.yxy, k.yyx, k.xxx);

    vec3 normal = vec3(0.0, 0.0, 0.0);

    for (int i = 0; i < 4; i++) {
        normal += ks[i] * map(p + ks[i] * h);
    }

    return normalize(normal);
}


/*!
 * @brief Calculate squared value.
 * @param [in] x  A value.
 * @return x * x
 */
float sq(float x)
{
    return x * x;
}
