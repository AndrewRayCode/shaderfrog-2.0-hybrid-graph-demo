const vertex = `
precision highp float;
layout(std140,column_major) uniform;
uniform Material
{
uniform vec2 vAlbedoInfos;
uniform vec4 vAmbientInfos;
uniform vec2 vOpacityInfos;
uniform vec2 vEmissiveInfos;
uniform vec2 vLightmapInfos;
uniform vec3 vReflectivityInfos;
uniform vec2 vMicroSurfaceSamplerInfos;
uniform vec2 vReflectionInfos;
uniform vec2 vReflectionFilteringInfo;
uniform vec3 vReflectionPosition;
uniform vec3 vReflectionSize;
uniform vec3 vBumpInfos;
uniform mat4 albedoMatrix;
uniform mat4 ambientMatrix;
uniform mat4 opacityMatrix;
uniform mat4 emissiveMatrix;
uniform mat4 lightmapMatrix;
uniform mat4 reflectivityMatrix;
uniform mat4 microSurfaceSamplerMatrix;
uniform mat4 bumpMatrix;
uniform vec2 vTangentSpaceParams;
uniform mat4 reflectionMatrix;
uniform vec3 vReflectionColor;
uniform vec4 vAlbedoColor;
uniform vec4 vLightingIntensity;
uniform vec3 vReflectionMicrosurfaceInfos;
uniform float pointSize;
uniform vec4 vReflectivityColor;
uniform vec3 vEmissiveColor;
uniform float visibility;
uniform vec4 vMetallicReflectanceFactors;
uniform vec2 vMetallicReflectanceInfos;
uniform mat4 metallicReflectanceMatrix;
uniform vec2 vClearCoatParams;
uniform vec4 vClearCoatRefractionParams;
uniform vec4 vClearCoatInfos;
uniform mat4 clearCoatMatrix;
uniform mat4 clearCoatRoughnessMatrix;
uniform vec2 vClearCoatBumpInfos;
uniform vec2 vClearCoatTangentSpaceParams;
uniform mat4 clearCoatBumpMatrix;
uniform vec4 vClearCoatTintParams;
uniform float clearCoatColorAtDistance;
uniform vec2 vClearCoatTintInfos;
uniform mat4 clearCoatTintMatrix;
uniform vec3 vAnisotropy;
uniform vec2 vAnisotropyInfos;
uniform mat4 anisotropyMatrix;
uniform vec4 vSheenColor;
uniform float vSheenRoughness;
uniform vec4 vSheenInfos;
uniform mat4 sheenMatrix;
uniform mat4 sheenRoughnessMatrix;
uniform vec3 vRefractionMicrosurfaceInfos;
uniform vec2 vRefractionFilteringInfo;
uniform vec4 vRefractionInfos;
uniform mat4 refractionMatrix;
uniform vec2 vThicknessInfos;
uniform mat4 thicknessMatrix;
uniform vec2 vThicknessParam;
uniform vec3 vDiffusionDistance;
uniform vec4 vTintColor;
uniform vec3 vSubSurfaceIntensity;
uniform float scatteringDiffusionProfile;
uniform vec4 vDetailInfos;
uniform mat4 detailMatrix;
};
uniform Scene {
mat4 viewProjection;
mat4 view;
};
#define CUSTOM_VERTEX_BEGIN
in vec3 position;
in vec3 normal;
in vec2 uv;
out vec2 vMainUV1;
const float PI=3.1415926535897932384626433832795;
const float HALF_MIN=5.96046448e-08;
const float LinearEncodePowerApprox=2.2;
const float GammaEncodePowerApprox=1.0/LinearEncodePowerApprox;
const vec3 LuminanceEncodeApprox=vec3(0.2126,0.7152,0.0722);
const float Epsilon=0.0000001;
#define saturate(x) clamp(x,0.0,1.0)
#define absEps(x) abs(x)+Epsilon
#define maxEps(x) max(x,Epsilon)
#define saturateEps(x) clamp(x,Epsilon,1.0)
mat3 transposeMat3(mat3 inMatrix) {
vec3 i0=inMatrix[0];
vec3 i1=inMatrix[1];
vec3 i2=inMatrix[2];
mat3 outMatrix=mat3(
vec3(i0.x,i1.x,i2.x),
vec3(i0.y,i1.y,i2.y),
vec3(i0.z,i1.z,i2.z)
);
return outMatrix;
}
mat3 inverseMat3(mat3 inMatrix) {
float a00=inMatrix[0][0],a01=inMatrix[0][1],a02=inMatrix[0][2];
float a10=inMatrix[1][0],a11=inMatrix[1][1],a12=inMatrix[1][2];
float a20=inMatrix[2][0],a21=inMatrix[2][1],a22=inMatrix[2][2];
float b01=a22*a11-a12*a21;
float b11=-a22*a10+a12*a20;
float b21=a21*a10-a11*a20;
float det=a00*b01+a01*b11+a02*b21;
return mat3(b01,(-a22*a01+a02*a21),(a12*a01-a02*a11),
b11,(a22*a00-a02*a20),(-a12*a00+a02*a10),
b21,(-a21*a00+a01*a20),(a11*a00-a01*a10))/det;
}
float toLinearSpace(float color)
{
return pow(color,LinearEncodePowerApprox);
}
vec3 toLinearSpace(vec3 color)
{
return pow(color,vec3(LinearEncodePowerApprox));
}
vec4 toLinearSpace(vec4 color)
{
return vec4(pow(color.rgb,vec3(LinearEncodePowerApprox)),color.a);
}
vec3 toGammaSpace(vec3 color)
{
return pow(color,vec3(GammaEncodePowerApprox));
}
vec4 toGammaSpace(vec4 color)
{
return vec4(pow(color.rgb,vec3(GammaEncodePowerApprox)),color.a);
}
float toGammaSpace(float color)
{
return pow(color,GammaEncodePowerApprox);
}
float square(float value)
{
return value*value;
}
float pow5(float value) {
float sq=value*value;
return sq*sq*value;
}
float getLuminance(vec3 color)
{
return clamp(dot(color,LuminanceEncodeApprox),0.,1.);
}
float getRand(vec2 seed) {
return fract(sin(dot(seed.xy ,vec2(12.9898,78.233)))*43758.5453);
}
float dither(vec2 seed,float varianceAmount) {
float rand=getRand(seed);
float dither=mix(-varianceAmount/255.0,varianceAmount/255.0,rand);
return dither;
}
const float rgbdMaxRange=255.0;
vec4 toRGBD(vec3 color) {
float maxRGB=maxEps(max(color.r,max(color.g,color.b)));
float D=max(rgbdMaxRange/maxRGB,1.);
D=clamp(floor(D)/255.0,0.,1.);
vec3 rgb=color.rgb*D;
rgb=toGammaSpace(rgb);
return vec4(rgb,D);
}
vec3 fromRGBD(vec4 rgbd) {
rgbd.rgb=toLinearSpace(rgbd.rgb);
return rgbd.rgb/rgbd.a;
}
uniform mat4 world;
out vec3 vPositionW;
out vec3 vNormalW;
uniform Light0
{
vec4 vLightData;
vec4 vLightDiffuse;
vec4 vLightSpecular;
vec3 vLightGround;
vec4 shadowsInfo;
vec2 depthValues;
} light0;
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
vec3 positionUpdated=position;
vec3 normalUpdated=normal;
vec2 uvUpdated=uv;
#define CUSTOM_VERTEX_UPDATE_POSITION
#define CUSTOM_VERTEX_UPDATE_NORMAL
mat4 finalWorld=world;
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);
vPositionW=vec3(worldPos);
mat3 normalWorld=mat3(finalWorld);
vNormalW=normalize(normalWorld*normalUpdated);
#define CUSTOM_VERTEX_UPDATE_WORLDPOS
gl_Position=viewProjection*worldPos;
vec2 uv2=vec2(0.,0.);
vMainUV1=uvUpdated;
#define CUSTOM_VERTEX_MAIN_END
}
`;
export default vertex;
