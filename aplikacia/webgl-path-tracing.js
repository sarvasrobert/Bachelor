/*
 WebGL Path Tracing (http://madebyevan.com/webgl-path-tracing/)
 License: MIT License (see below)
 Copyright (c) 2010 Evan Wallace
 Permission is hereby granted, free of charge, to any person
 obtaining a copy of this software and associated documentation
 files (the "Software"), to deal in the Software without
 restriction, including without limitation the rights to use,
 copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the
 Software is furnished to do so, subject to the following
 conditions:
 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 OTHER DEALINGS IN THE SOFTWARE.
*/



////////////////////////////////////////////////////////////////////////////////
// shader strings
////////////////////////////////////////////////////////////////////////////////
// vertex shader for drawing a textured quad
var renderVertexSource =
' attribute vec3 vertex;' +
' attribute vec3 a_positionX;' +
' attribute vec3 a_positionY;' +
' attribute vec3 a_positionZ;' +
' varying vec2 a_texcoordX;' +
' varying vec2 a_texcoordY;' +
' varying vec2 a_texcoordZ;' + 
' varying vec2 texCoord;' +
' void main() {' +
'   texCoord = vertex.xy * 0.5 + 0.5;' +
'   gl_Position = vec4(vertex, 1.0);' +
' }';

// fragment shader for drawing a textured quad
var renderFragmentSource =
' precision highp float;' +
' varying vec2 a_texcoordX;' +
' varying vec2 a_texcoordY;' +
' varying vec2 a_texcoordZ;' + 
' varying vec2 texCoord;' +
' uniform sampler2D texture;' +
' void main() {' +
'   gl_FragColor = texture2D(texture, texCoord);' +
' }';

// constants for the shaders
var bounces = '4';
var epsilon = '0.0001';
var infinity = '10000.0';
var lightSize = 0.1;
var lightVal = 2.5;
var sampling = 128;

// vertex shader, interpolate ray per-pixel
var tracerVertexSource =
' attribute vec3 vertex;' +
' uniform vec3 eye, ray00, ray01, ray10, ray11;' +
' varying vec3 initialRay;' +
' void main() {' +
'   vec2 percent = vertex.xy * 0.5 + 0.5;' +
'   initialRay = mix(mix(ray00, ray01, percent.y), mix(ray10, ray11, percent.y), percent.x);' +
'   gl_Position = vec4(vertex, 1.0);' +
' }';

// start of fragment shader
var tracerFragmentSourceHeader =
' precision highp float;' +
' uniform vec3 eye;' +
' varying vec3 initialRay;' +
' uniform float textureWeight;' +
' uniform float timeSinceStart;' +
' uniform sampler2D textureA;' +
' uniform sampler2D textureV;' +
' uniform sampler2D textureI;' +
' uniform float glossiness;' +
' uniform vec2 uScreenResolution;' +
' uniform float screenWidth;' +
' uniform float screenHeight;' +
' vec3 roomCubeMin = vec3(-16.0, -10.9, -16.0);' +
' vec3 roomCubeMax = vec3(16.0, 10.9, 16.0);';
//' vec3 roomCubeMin = vec3(-30.0, -5.0, -50.0);' +
//' vec3 roomCubeMax = vec3(30.0, 4.8, 50.0);';
//' vec3 roomCubeMin = vec3(-2.0, -2.0, -2.0);' +
//' vec3 roomCubeMax = vec3(2.0, 2.0, 2.0);';


// compute the near and far intersections of the cube (stored in the x and y components) using the slab method
// no intersection means vec.x > vec.y (really tNear > tFar)
var intersectCubeSource =
' vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax, int id, inout float minT, inout int hitID) {' +
'   vec3 tMin = (cubeMin - origin) / ray;' +
'   vec3 tMax = (cubeMax - origin) / ray;' +
'   vec3 t1 = min(tMin, tMax);' +
'   vec3 t2 = max(tMin, tMax);' +
'   float tNear = max(max(t1.x, t1.y), t1.z);' +
'   float tFar = min(min(t2.x, t2.y), t2.z);' +
'   if ((tNear > 0.0) && (tNear < minT) && (tNear < tFar)) { minT = tNear; hitID = id; }' +
'   return vec2(tNear, tFar);' +
' }';


// given that hit is a point on the cube, what is the surface normal?
// TODO: do this with fewer branches
var normalForCubeSource =
' vec3 normalForCube(vec3 hit, vec3 cubeMin, vec3 cubeMax)' +
' {' +
'   if(hit.x < cubeMin.x + ' + epsilon + ') return vec3(-1.0, 0.0, 0.0);' +
'   else if(hit.x > cubeMax.x - ' + epsilon + ') return vec3(1.0, 0.0, 0.0);' +
'   else if(hit.y < cubeMin.y + ' + epsilon + ') return vec3(0.0, -1.0, 0.0);' +
'   else if(hit.y > cubeMax.y - ' + epsilon + ') return vec3(0.0, 1.0, 0.0);' +
'   else if(hit.z < cubeMin.z + ' + epsilon + ') return vec3(0.0, 0.0, -1.0);' +
'   else return vec3(0.0, 0.0, 1.0);' +
' }';

// compute the near intersection of a sphere
// no intersection returns a value of +infinity
var intersectSphereSource =
' float intersectSphere(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius, int id, inout float minT, inout int hitID) {' +
'   vec3 toSphere = origin - sphereCenter;' +
'   float a = dot(ray, ray);' +
'   float b = 2.0 * dot(toSphere, ray);' +
'   float c = dot(toSphere, toSphere) - sphereRadius*sphereRadius;' +
'   float discriminant = b*b - 4.0*a*c;' +
'   if(discriminant > 0.0) {' +
'     float t = (-b - sqrt(discriminant)) / (2.0 * a);' +
//'     float d = origin.z - t;'
'     if(t > 0.0) {\
        if (t < minT) { minT = t; hitID = id; }\
        return t; \
      }' +
'   return ' + infinity + ';' +
'    }' +
'   return ' + infinity + ';' +
' }';


// given that hit is a point on the sphere, what is the surface normal?
var normalForSphereSource =
' vec3 normalForSphere(vec3 hit, vec3 sphereCenter, float sphereRadius) {' +
'   return (hit - sphereCenter) / sphereRadius;' +
' }';

var intersectTriangleSource =
 ' float intersectTriangle(vec3 origin, vec3 ray, vec3 v1, vec3 v2, vec3 v3, bool culling, int id, inout float minT, inout int hitID) {' +
 //'' + console.log( + ' v1 ' + ); +
 '   vec3 edge1 = v2 - v1;' +
 '   vec3 edge2 = v3 - v1;' +
 '   vec3 pvec = cross(ray, edge2);' +
 '   float det = dot(edge1, pvec);' +
 '   float inv_det = 1.0 / det;' +
 '   float d = culling ? det : abs(det);' +
 '   if (d < 0.000001) {return ' + infinity + ';}' +
 '   vec3 tvec = origin -  v1;' + 
 '   float u = dot(tvec, pvec) * inv_det;' + 
 '   if (u < 0.0 || u > 1.0) {return ' + infinity + ';}' + //{return vec3(' + infinity + ','  + infinity +', '  + infinity + '); }' +
 '   vec3 qvec = cross(tvec, edge1);' + 
 '   float v = dot(ray, qvec) * inv_det;' +
 '   if (v < 0.0 ||  (u + v) > 1.0) {return ' + infinity + ';}' + //{return vec3(' + infinity + ','  + infinity +', '  + infinity + '); }' +
 '   float t =  dot(edge2, qvec);' +
 '   t = t * inv_det;' +
 //'   t =  (t  ) ; ' + //* u * v);' + 
'     if ((t > 0.0) && (t < minT)) { minT = t; hitID = id; }\
      return t;' + 
' }'; 

var intersectTriangleSource2 =
 ' float intersectTriangle2(vec3 origin, vec3 ray, vec3 v1, vec3 v2, vec3 v3, bool culling, inout float minT, inout vec3 hitv0, inout vec3 hitv1, inout vec3 hitv2) {' +
 '   vec3 edge1 = v2 - v1;' +
 '   vec3 edge2 = v3 - v1;' +
 '   vec3 pvec = cross(ray, edge2);' +
 '   float det = dot(edge1, pvec);' +
 '   float inv_det = 1.0 / det;' +
 '   float d = culling ? det : abs(det);' +
 '   if (d < 0.000001) {return ' + infinity + ';}' +
 '   vec3 tvec = origin -  v1;' + 
 '   float u = dot(tvec, pvec) * inv_det;' + 
 '   if (u < 0.0 || u > 1.0) {return ' + infinity + ';}' + //{return vec3(' + infinity + ','  + infinity +', '  + infinity + '); }' +
 '   vec3 qvec = cross(tvec, edge1);' + 
 '   float v = dot(ray, qvec) * inv_det;' +
 '   if (v < 0.0 ||  (u + v) > 1.0) {return ' + infinity + ';}' + //{return vec3(' + infinity + ','  + infinity +', '  + infinity + '); }' +
 '   float t =  dot(edge2, qvec);' +
 '   t = t * inv_det;' +
 //'   t =  (t  ) ; ' + //* u * v);' + 
'     if ((t > 0.0) && (t < minT)) { minT = t; hitv0 = v1; hitv1 = v2; hitv2 = v3; }\
      return t;' + 
' }'; 

var normalForTriangleSource =
' vec3 normalForTriangle(vec3 ray, vec3 hit, vec3 v1, vec3 v2, vec3 v3, bool cull) {' +
 '   vec3 edge1 = v2 - v1;' +
 '   vec3 edge2 = v3 - v1;' +
 '   vec3 n = cross(normalize(edge1), normalize(edge2));' +
 '   return (cull || dot(n, ray) < 0.0) ? n : -n;' +
' }';


var intersectCylinderSource =
' vec2 intersectCylinder(vec3 origin, vec3 ray, vec3 CylinderCenter, float CylinderRadius, float CylinderHeight, float CylinderDirection, int id, inout float minT, inout int hitID) {' +
'   if (CylinderDirection < 0.5) { ' +
'       origin = origin - CylinderCenter;' +
'       origin = vec3( origin.y, -origin.x, origin.z);' +
'       origin = origin + CylinderCenter;' +
'       ray = vec3( ray.y, -ray.x, ray.z);' +
'   } else if (CylinderDirection > 1.5) {' + 
'       origin = origin - CylinderCenter;' +
'       origin = vec3( origin.x, origin.z, -origin.y);' +
'       origin = origin + CylinderCenter;' +
'       ray = vec3( ray.x, ray.z, -ray.y);' +
'   }' +    
'   vec3 toSphere = origin - CylinderCenter;' +
'   float cylHeight =  CylinderHeight;'+
'   float r2 = CylinderRadius*CylinderRadius;'+
'   float h2 = cylHeight * cylHeight;'+
'   float t = 0.0;' +
'   vec2 origCircDist = origin.xz - CylinderCenter.xz;' +
'   if (dot(origCircDist, origCircDist) < r2) {' +
'             vec2 Y = vec2(CylinderCenter.y - cylHeight, CylinderCenter.y + cylHeight);' +
'             vec2 t2 =  (Y - origin.yy ) / ray.y ;' +
'             vec2 sorted = vec2(min(t2.x,t2.y), max(t2.x,t2.y));' +
'             if (sorted.x > 0.0) {' +
'               t = sorted.x - ' + epsilon + ';' +
'             } else if(sorted.y > 0.0){' +
'               t = sorted.y + ' + epsilon + ';' + 
'             } else { return vec2(' + infinity + ', ' + infinity + '); }' +
'             vec3 newP = origin + (t*ray);' +
'             vec2 circ = CylinderCenter.xz - newP.xz;' +
'             if (dot(circ, circ) <= r2  && (t < minT)) {' + 
'               minT = t; hitID = id; ' +
'               return vec2(t, -1.0);' +
'             }' +
'   } else {' +
'   float a = dot(ray.xz, ray.xz) ;'+   // + dot(ray.z,ray.z)) + dot(CylinderCenter.z, CylinderCenter.z);' +// + dot(CylinderCenter.z,ray.z);' +
'   float b = 2.0* dot(toSphere.xz, ray.xz);' + // + dot(CylinderCenter.z , ray.z);' +
'   float c = dot(toSphere.xz, toSphere.xz) - r2;' +// + dot(CylinderCenter.z , ray.z);' +
'   float discriminant = b*b - 4.0*a*c;' +
  'if(discriminant > 0.0) {' +
  '     t = (-b - sqrt(discriminant)) / (2.0 * a);' +
  '     if(t > 0.0) {  ' + 
'           vec3 v = (origin + (t*ray)) - CylinderCenter; ' +
'           float s = dot(v,v) - r2;' +
'           if (s <= h2 && (t < minT)) {' +
'               minT = t; hitID = id; ' +
'               return vec2(t, 1.0);' +
'           }' + 
'           else {' + 
'             vec2 Y = vec2(CylinderCenter.y - cylHeight, CylinderCenter.y + cylHeight);' +
'             vec2 t2 =  (Y - origin.yy) / ray.y;' +
'             vec2 sorted = vec2(min(t2.x,t2.y), max(t2.x,t2.y));' +
'             if (sorted.x > 0.0) {' +
'               t = sorted.x - ' + epsilon + ';' +
'             } else if(sorted.y > 0.0){' +
'               t = sorted.y + ' + epsilon + ';' + 
'             } else { return vec2(' + infinity + ', ' + infinity + '); }' +
'             vec3 newP = origin + (t*ray);' +
'             vec2 circ = CylinderCenter.xz - newP.xz;' +
'             if (dot(circ, circ) <= r2 && (t < minT)) {' +
'               minT = t; hitID = id; ' + 
'               return vec2(t, 0.0);' +
'             }' +
'           }' +
'       }' +
'   }' +
' }' +
'   return vec2(' + infinity + ', ' + infinity + ');' +
' }';


// given that hit is a point on the sphere, what is the surface normal?
var normalForCylinderSource =
' vec3 normalForCylinder(vec3 hit, float helper, vec3 CylinderCenter, float CylinderRadius, float CylinderDirection) {' +
'   if (CylinderDirection < 0.5 ) { ' +
'       if (helper > 0.0 ) { return normalize(vec3(0.0, hit.y - CylinderCenter.y, hit.z - CylinderCenter.z));}' +
'       else if (hit.x > CylinderCenter.x ) { return vec3(1.0,0.0,0.0); }' +
'       else return vec3(-1.0,0.0,0.0);' +
'   } else if (CylinderDirection > 1.5)  { ' +
'       if (helper > 0.0 ) { return normalize(vec3(hit.x - CylinderCenter.x, hit.y - CylinderCenter.y, 0.0));}' +
'       else if (hit.z > CylinderCenter.z ) { return vec3(0.0,0.0,1.0); }' +
'       else return vec3(0.0,0.0,-1.0);' +
'   } else { ' +
'   if (helper > 0.0) { return normalize(vec3(hit.x - CylinderCenter.x, 0.0, hit.z - CylinderCenter.z));}' +
'   else if (hit.y > CylinderCenter.y ) { return vec3(0.0,1.0,0.0); }' +
'   else return vec3(0.0,-1.0,0.0);' +
'   }; ' +
' }';

// use the fragment position for randomness
var randomSource =
' float random(vec3 scale, float seed) {' +
'   return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);' +
' }';

// random cosine-weighted distributed vector
// from http://www.rorydriscoll.com/2009/01/07/better-sampling/
var cosineWeightedDirectionSource =
' vec3 cosineWeightedDirection(float seed, vec3 normal) {' +
'   float u = random(vec3(12.9898, 78.233, 151.7182), seed);' +
'   float v = random(vec3(63.7264, 10.873, 623.6736), seed);' +
'   float r = sqrt(u);' +
'   float angle = 6.283185307179586 * v;' +
    // compute basis from normal
'   vec3 sdir, tdir;' +
'   if (abs(normal.x)<.5) {' +
'     sdir = cross(normal, vec3(1,0,0));' +
'   } else {' +
'     sdir = cross(normal, vec3(0,1,0));' +
'   }' +
'   tdir = cross(normal, sdir);' +
'   return r*cos(angle)*sdir + r*sin(angle)*tdir + sqrt(1.-u)*normal;' +
' }';

// random normalized vector
var uniformlyRandomDirectionSource =
' vec3 uniformlyRandomDirection(float seed) {' +
'   float u = random(vec3(12.9898, 78.233, 151.7182), seed);' +
'   float v = random(vec3(63.7264, 10.873, 623.6736), seed);' +
'   float z = 1.0 - 2.0 * u;' +
'   float r = sqrt(1.0 - z * z);' +
'   float angle = 6.283185307179586 * v;' +
'   return vec3(r * cos(angle), r * sin(angle), z);' +
' }';

// random vector in the unit sphere
// note: this is probably not statistically uniform, saw raising to 1/3 power somewhere but that looks wrong?
var uniformlyRandomVectorSource =
' vec3 uniformlyRandomVector(float seed) {' +
'   return uniformlyRandomDirection(seed) * sqrt(random(vec3(36.7539, 50.3658, 306.2759), seed));' +
' }';

// compute specular lighting contribution
var specularReflection =
' vec3 reflectedLight = normalize(reflect(light - hit, normal));' +
' specularHighlight = max(0.0, dot(reflectedLight, normalize(hit - origin)));';

// update ray using normal and bounce according to a diffuse reflection
var newDiffuseRay =
' ray = cosineWeightedDirection(timeSinceStart + float(bounce), normal);';

// update ray using normal according to a specular reflection
var newReflectiveRay =
' ray = reflect(ray, normal);' +
  specularReflection +
' specularHighlight = 2.0 * pow(specularHighlight, 20.0);';

// update ray using normal and bounce according to a glossy reflection
var newGlossyRay =
' ray = normalize(reflect(ray, normal)) + uniformlyRandomVector(timeSinceStart + float(bounce)) * glossiness;' +
  specularReflection +
' specularHighlight = pow(specularHighlight, 3.0);';

var yellowBlueCornellBox =
' if(hit.x < -15.99999) surfaceColor = vec3(0.1, 0.5, 1.0);' + // blue
' else if(hit.x > 15.99999) surfaceColor = vec3(1.0, 0.9, 0.1);'; // yellow

var orangePurpleCornellBox =
' if(hit.x < -15.99999) surfaceColor = vec3(0.29, 0, 0.51);' + // red
' else if(hit.x > 15.99999) surfaceColor = vec3(1.0, 0.5, 0);'; // green

function makeShadow(objects) {
  return '' +
' float shadow(vec3 origin, vec3 ray) {\
    float t = 0.0;\
    int hitID = -1;' +
'   float helper = 0.0;' +
    concat(objects, function(o){ return o.getShadowTestCode(); }) +
'   return 1.0;' +
' }';
}

function makeCalculateColor(objects) {
  return '' +
' vec3 calculateColor(vec3 origin, vec3 ray, vec3 light) {' +
'   vec3 colorMask = vec3(1.0);' +
'   vec3 accumulatedColor = vec3(0.0);' +
  
    // main raytracing loop
'   for(int bounce = 0; bounce < ' + bounces + '; bounce++) {\
        float t = 0.0;\
        int hitID = -1;\
  ' +
      // compute the intersection with everything
'     vec2 tRoom = intersectCube(origin, ray, roomCubeMin, roomCubeMax, 0, t, hitID);\
      if (tRoom.x < tRoom.y) t = tRoom.y;\
' +
      concat(objects, function(o){ return o.getIntersectCode(); }) +

      // find the closest intersection
'     float helper = 0.0;' +

      // info about hit
'     vec3 hit = origin + ray * t;' +
'     vec3 surfaceColor = vec3(0.75);' +
'     float specularHighlight = 0.0;' +
'     vec3 normal;' +

      // calculate the normal (and change wall color)
'     if(t == tRoom.y) {' +
'       normal = -normalForCube(hit, roomCubeMin, roomCubeMax);' +
        [yellowBlueCornellBox, orangePurpleCornellBox][environment] +
        newDiffuseRay +
'     } else if(t == ' + infinity + ') {' +
'       break;' +
'     } else {' +
'       if(false) ;' + // hack to discard the first 'else' in 'else if'
        concat(objects, function(o){ return o.getNormalCalculationCode(); }) +
        [newDiffuseRay, newReflectiveRay, newGlossyRay][material] +
'     }' +

      // compute diffuse lighting contribution
'     vec3 toLight = light - hit;' +
'     float diffuse = max(0.0, dot(normalize(toLight), normal));' +

'     vec3 toLightEps = light - (hit + (normal * ' + epsilon + '));' +
      // trace a shadow ray to the light
'     float shadowIntensity = shadow(hit + normal * ' + epsilon + ', toLightEps);' +
      // do light bounce
'     colorMask *= surfaceColor;' +
'     accumulatedColor += colorMask * (' + lightVal + ' * diffuse * shadowIntensity);' +
'     accumulatedColor += colorMask * specularHighlight * shadowIntensity;' +

      // calculate next origin
'     origin = hit;' +
'   }' +
  (bounces > 1 ? '   return accumulatedColor * ' + 1.0/bounces + ' ;' : '   return accumulatedColor;') +
' }';
}

function makeShadow2(trianglesCount, indexTextureSize) {
  return '' +  
  'void incrementLocation(inout int h, inout float ix, inout float iy) {\
        ++h;\
        if (h >= ' + indexTextureSize + ')\
        {\
          iy += ' + (1.0 / indexTextureSize) + ';\
          ix = ' + (0.5 / indexTextureSize) + ';\
          h = 0;\
        }\
        else\
        {\
          ix += ' + (1.0 / indexTextureSize) + ';\
        }\
      }' +
'float shadow(vec3 origin, vec3 ray) {\
    float t = 0.0; vec3 hitv0; vec3 hitv1; vec3 hitv2;\
    float ix = ' + (0.5 / indexTextureSize) + ';\
    float iy = ' + (0.5 / indexTextureSize) + ';\
    int h = 0;\
    for(int i = 0; i < ' + trianglesCount + '; ++i)\
    {\
      vec4 vi = texture2D(textureI, vec2(ix, iy));\
      vec3 v0 = texture2D(textureV, vec2(vi.x, vi.w)).xyz;\
      incrementLocation(h, ix, iy);\
      \
      vi = texture2D(textureI, vec2(ix, iy));\
      vec3 v1 = texture2D(textureV, vec2(vi.x, vi.w)).xyz;\
      incrementLocation(h, ix, iy);\
      \
      vi = texture2D(textureI, vec2(ix, iy));\
      vec3 v2 = texture2D(textureV, vec2(vi.x, vi.w)).xyz;\
      incrementLocation(h, ix, iy);\
      \
      float t = intersectTriangle2(origin, ray, v0, v1, v2, true, t, hitv0, hitv1, hitv2);\
      if (t > 0.0 && t < 1.0) return 0.0;\
    }\
    return 1.0;' +
' }';
}

function makeCalculateColor2(trianglesCount, indexTextureSize) {
  return '' +
' vec3 calculateColor(vec3 origin, vec3 ray, vec3 light) {' +
'   vec3 colorMask = vec3(1.0);' +
'   vec3 accumulatedColor = vec3(0.0);' +
  
    // main raytracing loop
'   for(int bounce = 0; bounce < ' + bounces + '; bounce++) {\
        float t = 0.0;\
        int hitID;\
        vec3 hitV0, hitV1, hitV2;\
  ' +
      // compute the intersection with everything
'     vec2 tRoom = intersectCube(origin, ray, roomCubeMin, roomCubeMax, 0, t, hitID);\
      if (tRoom.x < tRoom.y) t = tRoom.y;\
      \
      float ix = ' + (0.5 / indexTextureSize) + ';\
      float iy = ' + (0.5 / indexTextureSize) + ';\
      int h = 0;\
      for(int i = 0; i < ' + trianglesCount + '; ++i)\
      {\
        vec4 vi = texture2D(textureI, vec2(ix, iy));\
        vec3 v0 = texture2D(textureV, vec2(vi.x, vi.w)).xyz;\
        incrementLocation(h, ix, iy);\
        \
        vi = texture2D(textureI, vec2(ix, iy));\
        vec3 v1 = texture2D(textureV, vec2(vi.x, vi.w)).xyz;\
        incrementLocation(h, ix, iy);\
\
        vi = texture2D(textureI, vec2(ix, iy));\
        vec3 v2 = texture2D(textureV, vec2(vi.x, vi.w)).xyz;\
        incrementLocation(h, ix, iy);\
\
        intersectTriangle2(origin, ray, v0, v1, v2, true, t, hitV0, hitV1, hitV2);\
      }\
    float helper = 0.0;' +
      // info about hit
'     vec3 hit = origin + ray * t;' +
'     vec3 surfaceColor = vec3(0.75);' +
'     float specularHighlight = 0.0;' +
'     vec3 normal;' +

      // calculate the normal (and change wall color)
'     if(t == tRoom.y) {' +
'       normal = -normalForCube(hit, roomCubeMin, roomCubeMax);' +
        [yellowBlueCornellBox, orangePurpleCornellBox][environment] +
        newDiffuseRay +
'     } else if(t == ' + infinity + ') {' +
'       break;' +
'     } else {\
          normal = normalForTriangle(ray, hit, hitV0, hitV1, hitV2, true);' +
        [newDiffuseRay, newReflectiveRay, newGlossyRay][material] +
'     }' +

      // compute diffuse lighting contribution
'     vec3 toLight = light - hit;' +
'     float diffuse = max(0.0, dot(normalize(toLight), normal));' +

'     vec3 toLightEps = light - (hit + (normal * ' + epsilon + '));' +
      // trace a shadow ray to the light
'     float shadowIntensity = shadow(hit + normal * ' + epsilon + ', toLight);' +
      // do light bounce
'     colorMask *= surfaceColor;' +
'     accumulatedColor += colorMask * (' + lightVal + ' * diffuse * shadowIntensity);' +
'     accumulatedColor += colorMask * specularHighlight * shadowIntensity;' +

      // calculate next origin
'     origin = hit;' +
'   }' +
  (bounces > 1 ? '   return accumulatedColor * ' + 1.0/bounces + ' ;' : '   return accumulatedColor;') +
' }';
}

function makeMain() {
  return '' +
' void main() {' +
'   vec3 newLight = light + uniformlyRandomVector(timeSinceStart - 53.0) * ' + lightSize + ';' +
'   vec2 xy = gl_FragCoord.xy;    ' +
'   xy.x = xy.x / ' + canvas.width.toFixed(2) + ';' +
'   xy.y = xy.y / ' + canvas.height.toFixed(2) + ';'  +
'   vec3 texture = texture2D(textureA,  xy ).rgb;' +
'   gl_FragColor = vec4(mix(calculateColor(eye, initialRay, newLight), texture, textureWeight), 1.0);' +
' }';
}

function makeMain2() {
  return '' +
' void main() {' +
'   vec3 newLight = light + uniformlyRandomVector(timeSinceStart - 53.0) * ' + lightSize + ';' +
'   vec2 xy = gl_FragCoord.xy;    ' +
'   xy.x = xy.x / ' + canvas.width.toFixed(2) + ';' +
'   xy.y = xy.y / ' + canvas.height.toFixed(2) + ';'  +
'   vec3 texture = texture2D(textureA,  xy ).rgb;' +
'   float dummy0 = texture2D(textureV,  xy ).r;' +
'   float dummy1 = texture2D(textureI,  xy ).r;' +
'   gl_FragColor = vec4(mix(calculateColor(eye, initialRay, newLight), texture, textureWeight + (dummy0 * 0.0 + dummy1 * 0.0)), 1.0);' +
' }';
}

function makeTracerFragmentSource(objects) {
  return tracerFragmentSourceHeader +
  concat(objects, function(o){ return o.getGlobalCode(); }) +
  intersectCubeSource +
  normalForCubeSource +
  intersectSphereSource +
  normalForSphereSource +
  intersectTriangleSource +
  normalForTriangleSource +
  intersectCylinderSource +
  normalForCylinderSource +
  randomSource +
  cosineWeightedDirectionSource +
  uniformlyRandomDirectionSource +
  uniformlyRandomVectorSource +
  makeShadow(objects) +
  makeCalculateColor(objects) +
  makeMain();
}

function makeTracerFragmentSource2(objects, trianglesCount, indexTextureSize) {
  return tracerFragmentSourceHeader +
  concat(objects, function(o){ return o.getGlobalCode(); }) +
  intersectCubeSource +
  normalForCubeSource + 
  intersectTriangleSource2 +
  normalForTriangleSource +
  randomSource +
  cosineWeightedDirectionSource +
  uniformlyRandomDirectionSource +
  uniformlyRandomVectorSource +
  makeShadow2(trianglesCount, indexTextureSize) +
  makeCalculateColor2(trianglesCount, indexTextureSize) +
  makeMain2();
}


////////////////////////////////////////////////////////////////////////////////
// utility functions
////////////////////////////////////////////////////////////////////////////////

function getEyeRay(matrix, x, y) {
  return matrix.multiply(Vector.create([x, y, 0, 1])).divideByW().ensure3().subtract(eye);
}

function setUniforms(program, uniforms) {
  for(var name in uniforms) {
    var value = uniforms[name];
    var location = gl.getUniformLocation(program, name);
    if(location == null) continue;
    if(value instanceof Vector) {
      gl.uniform3fv(location, new Float32Array([value.elements[0], value.elements[1], value.elements[2]]));
    } else if(value instanceof Matrix) {
      gl.uniformMatrix4fv(location, false, new Float32Array(value.flatten()));
    } else if(value instanceof String){
      gl.uniform1i(location, parseInt(value));
    }
    else
    {
      gl.uniform1f(location, value);
    }
  }
}

function concat(objects, func) {
  var text = '';
  for(var i = 0; i < objects.length; i++) {
    text += func(objects[i]);
  }
  return text;
}

Vector.prototype.ensure2 = function() {
  return Vector.create([this.elements[0], this.elements[1]]);
};

Vector.prototype.ensure3 = function() {
  return Vector.create([this.elements[0], this.elements[1], this.elements[2]]);
};

Vector.prototype.ensure4 = function(w) {
  return Vector.create([this.elements[0], this.elements[1], this.elements[2], w]);
};

Vector.prototype.divideByW = function() {
  var w = this.elements[this.elements.length - 1];
  var newElements = [];
  for(var i = 0; i < this.elements.length; i++) {
    newElements.push(this.elements[i] / w);
  }
  return Vector.create(newElements);
};

Vector.prototype.componentDivide = function(vector) {
  if(this.elements.length != vector.elements.length) {
    return null;
  }
  var newElements = [];
  for(var i = 0; i < this.elements.length; i++) {
    newElements.push(this.elements[i] / vector.elements[i]);
  }
  return Vector.create(newElements);
};

Vector.min = function(a, b) {
  if(a.length != b.length) {
    return null;
  }
  var newElements = [];
  for(var i = 0; i < a.elements.length; i++) {
    newElements.push(Math.min(a.elements[i], b.elements[i]));
  }
  return Vector.create(newElements);
};

Vector.min2 = function(a, b) {
  if(a.length != b.length) {
    return null;
  }
  var newElements = [];
  for(var i = 0; i < 2; i++) {
    newElements.push(Math.min(a.elements[i], b.elements[i]));
  }
  newElements.push(0.0);
  return Vector.create(newElements);
};


Vector.max = function(a, b) {
  if(a.length != b.length) {
    return null;
  }
  var newElements = [];
  for(var i = 0; i < a.elements.length; i++) {
    newElements.push(Math.max(a.elements[i], b.elements[i]));
  }
  return Vector.create(newElements);
};

Vector.max = function(a, b) {
  if(a.length != b.length) {
    return null;
  }
  var newElements = [];
  for(var i = 0; i < 2; i++) {
    newElements.push(Math.max(a.elements[i], b.elements[i]));
  }
  newElements.push(0.0);
  return Vector.create(newElements);
};

Vector.prototype.minComponent = function() {
  var value = Number.MAX_VALUE;
  for(var i = 0; i < this.elements.length; i++) {
    value = Math.min(value, this.elements[i]);
  }
  return value;
};

Vector.prototype.maxComponent = function() {
  var value = -Number.MAX_VALUE;
  for(var i = 0; i < this.elements.length; i++) {
    value = Math.max(value, this.elements[i]);
  }
  return value;
};

function compileSource(source, type) {
  var shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw 'compile error: ' + gl.getShaderInfoLog(shader);
      }
  return shader;
}

function compileShader(vertexSource, fragmentSource) {
  var shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, compileSource(vertexSource, gl.VERTEX_SHADER));
  gl.attachShader(shaderProgram, compileSource(fragmentSource, gl.FRAGMENT_SHADER));
  gl.linkProgram(shaderProgram);
  if(!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw 'link error: ' + gl.getProgramInfoLog(shaderProgram);
  }
  return shaderProgram;
}

////////////////////////////////////////////////////////////////////////////////
// class Sphere
////////////////////////////////////////////////////////////////////////////////

function Sphere(center, radius, id) {
  this.mid = id;
  this.center = center;
  this.radius = radius;
  this.centerStr = 'sphereCenter' + id;
  this.radiusStr = 'sphereRadius' + id;
  this.intersectStr = 'tSphere' + id;
  this.temporaryTranslation = Vector.create([0, 0, 0]);
}

Sphere.prototype.getGlobalCode = function() {
  return '' +
' uniform vec3 ' + this.centerStr + ';' +
' uniform float ' + this.radiusStr + ';';
};

Sphere.prototype.getIntersectCode = function() {
  return '' +
' float ' + this.intersectStr + ' = intersectSphere(origin, ray, ' + this.centerStr + ', ' + this.radiusStr + ', ' + this.mid + ', t, hitID);';
};

Sphere.prototype.getShadowTestCode = function() {
  return 'if (intersectSphere(origin, ray, ' + this.centerStr + ', ' + this.radiusStr +', 0 , t, hitID) < 1.0) return 0.0;';
};

Sphere.prototype.getMinimumIntersectCode = function() {
  return '' +
' if(' + this.intersectStr + ' < t) { t = ' + this.intersectStr + '; hitID = ' + this.mid + '; }';
};

Sphere.prototype.getNormalCalculationCode = function() {
  return '' +
' else if(hitID == ' + this.mid + ') normal = normalForSphere(hit, ' + this.centerStr + ', ' + this.radiusStr + ');';
};

Sphere.prototype.setUniforms = function(renderer) {
  renderer.uniforms[this.centerStr] = this.center.add(this.temporaryTranslation);
  renderer.uniforms[this.radiusStr] = this.radius;
};

Sphere.prototype.temporaryTranslate = function(translation) {
  this.temporaryTranslation = translation;
};

Sphere.prototype.translate = function(translation) {
  this.center = this.center.add(translation);
};

Sphere.prototype.getMinCorner = function() {
  return this.center.add(this.temporaryTranslation).subtract(Vector.create([this.radius, this.radius, this.radius]));
};

Sphere.prototype.getMaxCorner = function() {
  return this.center.add(this.temporaryTranslation).add(Vector.create([this.radius, this.radius, this.radius]));
};


////////////////////////////////////////////////////////////////////////////////
// class Triangle
////////////////////////////////////////////////////////////////////////////////

function Triangle( v1, v2, v3,  cull, id) {
  this.mid = id;
  this.v1 = v1;
  this.v2 = v2;
  this.v3 = v3;
  this.cullStr = 'cull' + id;
  this.v1Str = 'v1' + id;
  this.v2Str = 'v2' + id;
  this.v3Str = 'v3' + id;
  this.culling = cull;
  this.intersectStr = 'tTriangle' + id;
  this.temporaryTranslation = Vector.create([0, 0, 0]);
}

Triangle.prototype.getGlobalCode = function() {
  return '' +
' uniform bool ' + this.cullStr + ';' +
' uniform vec3 ' + this.v1Str + ';' +
' uniform vec3 ' + this.v2Str + ';' +
' uniform vec3 ' + this.v3Str + ';';
};

Triangle.prototype.getIntersectCode = function() {
  return '' +
' float ' + this.intersectStr + ' = intersectTriangle(origin, ray, ' + this.v1Str + ', ' + this.v2Str + ', ' + this.v3Str + ', ' + this.cullStr +  ', ' + this.mid + ', t, hitID);';
};

Triangle.prototype.getShadowTestCode = function() {
  return '' +
  this.getIntersectCode() + 
' if(' + this.intersectStr + ' > 0.0 && ' + this.intersectStr + ' < 1.0 ) return 0.0;' //; ) return 0.0; '; //0.0 && ' + this.intersectStr + '.x < 1.0 && ' + this.intersectStr + '.x < ' + this.intersectStr + '.y) return 0.0;';
};

Triangle.prototype.getMinimumIntersectCode = function() {
  return '' +
' if(' + this.intersectStr + ' > 0.0 && ' + this.intersectStr + ' < t) { t = ' + this.intersectStr + '; hitID = ' + this.mid + '; }';
};

Triangle.prototype.getNormalCalculationCode = function() {
  return '' +
' else if(hitID == ' + this.mid + ') normal = normalForTriangle(ray, hit, ' + this.v1Str + ', ' + this.v2Str + ', ' + this.v3Str + ', ' + this.cullStr + ');';
};

Triangle.prototype.setUniforms = function(renderer) {
  renderer.uniforms[this.cullStr] = this.culling;
  renderer.uniforms[this.v1Str] = this.v1.add(this.temporaryTranslation);
  renderer.uniforms[this.v2Str] = this.v2.add(this.temporaryTranslation);
  renderer.uniforms[this.v3Str] = this.v3.add(this.temporaryTranslation);
};

Triangle.prototype.temporaryTranslate = function(translation) {
  this.temporaryTranslation = translation;
};

Triangle.prototype.translate = function(translation) {
  this.v1 = this.v1.add(translation);
  this.v2 = this.v2.add(translation);
  this.v3 = this.v3.add(translation);
};


Triangle.prototype.getMinCorner = function() {
  return this.v1.add(this.temporaryTranslation);
};

Triangle.prototype.getMaxCorner = function() {
  return this.v3.add(this.temporaryTranslation);
};


////////////////////////////////////////////////////////////////////////////////
// class Cylinder
////////////////////////////////////////////////////////////////////////////////

function Cylinder(center, radius, height, direction, id) {
  this.mid = id;
  this.center = center;
  this.radius = radius;
  this.Height = height;
  this.direction = direction;
  this.HeightStr = 'CylinderHeight' + id;
  this.DirStr = 'CylinderDirection' + id;  
  this.centerStr = 'CylinderCenter' + id;
  this.radiusStr = 'CylinderRadius' + id;
  this.intersectStr = 'tCylinder' + id;
  this.temporaryTranslation = Vector.create([0, 0, 0]);
}

Cylinder.prototype.getGlobalCode = function() {
  return '' +
' uniform vec3 ' + this.centerStr + ';' +
' uniform float ' + this.HeightStr + ';' +
' uniform float ' + this.DirStr + ';' +
' uniform float ' + this.radiusStr + ';';
};

Cylinder.prototype.getIntersectCode = function() {
  return '' +
' vec2 ' + this.intersectStr + ' = intersectCylinder(origin, ray, ' + this.centerStr + ', ' + this.radiusStr + ', ' + this.HeightStr + ', ' + this.DirStr + ', ' + this.mid + ',t, hitID);';
};

Cylinder.prototype.getShadowTestCode = function() {
  return '' +
  this.getIntersectCode() + 
' if(' + this.intersectStr + '.x > 0.0  && ' + this.intersectStr + '.x < 1.0 ) return 0.0;';
};

Cylinder.prototype.getMinimumIntersectCode = function() {
  return '' +
' if(' + this.intersectStr + '.x < t) { t = ' + this.intersectStr + '.x;' +
' helper = ' + this.intersectStr + '.y; ' +
' hitID = ' + this.mid + ';}';
};

Cylinder.prototype.getNormalCalculationCode = function() {
  return '' +
' else if(hitID == ' + this.mid + ') { helper =' + this.intersectStr + '.y;  normal = normalForCylinder(hit, helper, ' + this.centerStr + ', ' + this.radiusStr + ', ' + this.DirStr + '); }';
};

Cylinder.prototype.setUniforms = function(renderer) {
  renderer.uniforms[this.centerStr] = this.center.add(this.temporaryTranslation);
  renderer.uniforms[this.radiusStr] = this.radius;
  renderer.uniforms[this.HeightStr] = this.Height;
  renderer.uniforms[this.DirStr] = this.direction;
};

Cylinder.prototype.temporaryTranslate = function(translation) {
  this.temporaryTranslation = translation;
};

Cylinder.prototype.translate = function(translation) {
  this.center = this.center.add(translation);
};

Cylinder.prototype.getMinCorner = function() {
  return this.center.add(this.temporaryTranslation).subtract(Vector.create([this.radius, this.radius, this.radius]));
};

Cylinder.prototype.getMaxCorner = function() {
  return this.center.add(this.temporaryTranslation).subtract(Vector.create([this.radius, this.radius, this.radius]));
};

////////////////////////////////////////////////////////////////////////////////
// class Cube
////////////////////////////////////////////////////////////////////////////////

function Cube(minCorner, maxCorner, id) {
  this.mid = id;
  this.minCorner = minCorner;
  this.maxCorner = maxCorner;
  this.minStr = 'cubeMin' + id;
  this.maxStr = 'cubeMax' + id;
  this.intersectStr = 'tCube' + id;
  this.temporaryTranslation = Vector.create([0, 0, 0]);
}

Cube.prototype.getGlobalCode = function() {
  return '' +
' uniform vec3 ' + this.minStr + ';' +
' uniform vec3 ' + this.maxStr + ';';
};

Cube.prototype.getIntersectCode = function() {
  return '' +
' vec2 ' + this.intersectStr + ' = intersectCube(origin, ray, ' + this.minStr + ', ' + this.maxStr + ', ' + this.mid + ', t, hitID);';
};

Cube.prototype.getShadowTestCode = function() {
  return '' +
  this.getIntersectCode() + 
' if(' + this.intersectStr + '.x > 0.0 && ' + this.intersectStr + '.x < 1.0 && ' + this.intersectStr + '.x < ' + this.intersectStr + '.y) return 0.0;';
};

Cube.prototype.getMinimumIntersectCode = function() {
  return '' +
' if(' + this.intersectStr + '.x > 0.0 && ' + this.intersectStr + '.x < ' + this.intersectStr + '.y && ' + this.intersectStr + '.x < t) { t = ' + this.intersectStr + '.x'+ '; hitID = ' + this.mid + '; }';
};

Cube.prototype.getNormalCalculationCode = function() {
  return '' +
  // have to compare intersectStr.x < intersectStr.y otherwise two coplanar
  // cubes will look wrong (one cube will "steal" the hit from the other)
' else if(hitID == ' + this.mid + ') normal = normalForCube(hit, ' + this.minStr + ', ' + this.maxStr + ');';
};

Cube.prototype.setUniforms = function(renderer) {
  renderer.uniforms[this.minStr] = this.getMinCorner();
  renderer.uniforms[this.maxStr] = this.getMaxCorner();
};

Cube.prototype.temporaryTranslate = function(translation) {
  this.temporaryTranslation = translation;
};

Cube.prototype.translate = function(translation) {
  this.minCorner = this.minCorner.add(translation);
  this.maxCorner = this.maxCorner.add(translation);
};

Cube.prototype.getMinCorner = function() {
  return this.minCorner.add(this.temporaryTranslation);
};

Cube.prototype.getMaxCorner = function() {
  return this.maxCorner.add(this.temporaryTranslation);
};

////////////////////////////////////////////////////////////////////////////////
// class Light
////////////////////////////////////////////////////////////////////////////////

function Light() {
  this.temporaryTranslation = Vector.create([0, 0, 0]);
}

Light.prototype.getGlobalCode = function() {
  return 'uniform vec3 light;';
};

Light.prototype.getIntersectCode = function() {
  return '';
};

Light.prototype.getShadowTestCode = function() {
  return '';
};

Light.prototype.getMinimumIntersectCode = function() {
  return '';
};

Light.prototype.getNormalCalculationCode = function() {
  return '';
};

Light.prototype.setUniforms = function(renderer) {
  renderer.uniforms.light = light.add(this.temporaryTranslation);
};

Light.clampPosition = function(position) {
  for(var i = 0; i < position.elements.length; i++) {
    position.elements[i] = Math.max(lightSize - 1, Math.min(1 - lightSize, position.elements[i]));
  }
};

Light.prototype.temporaryTranslate = function(translation) {
  var tempLight = light.add(translation);
  Light.clampPosition(tempLight);
  this.temporaryTranslation = tempLight.subtract(light);
};

Light.prototype.translate = function(translation) {
  light = light.add(translation);
  Light.clampPosition(light);
};

Light.prototype.getMinCorner = function() {
  return light.add(this.temporaryTranslation).subtract(Vector.create([lightSize, lightSize, lightSize]));
};

Light.prototype.getMaxCorner = function() {
  return light.add(this.temporaryTranslation).add(Vector.create([lightSize, lightSize, lightSize]));
};

Light.prototype.intersect = function(origin, ray) {
  return Number.MAX_VALUE;
};

////////////////////////////////////////////////////////////////////////////////
// class PathTracer
////////////////////////////////////////////////////////////////////////////////

function PathTracer() {
  var vertices = [
    -1, -1,
    -1, +1,
    +1, -1,
    +1, +1
  ];

  // create vertex buffer
  this.vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  //console.log(gl.bufferData.length());

  // create framebuffer
  this.framebuffer = gl.createFramebuffer();

  // create textures
  var type = gl.getExtension('OES_texture_float') ? gl.FLOAT : gl.UNSIGNED_BYTE;
  //var type = gl.UNSIGNED_BYTE;
  this.textures = [];
  for(var i = 0; i < 2; i++) {
      this.textures.push(gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, window.innerWidth, window.innerHeight, 0, gl.RGB, type, null);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);


/////////////////////////////////END////////////////////////////////////////////

  // create render shader
  this.renderProgram = compileShader(renderVertexSource, renderFragmentSource);
  this.renderVertexAttribute = gl.getAttribLocation(this.renderProgram, 'vertex');
  gl.enableVertexAttribArray(this.renderVertexAttribute);

  // objects and shader will be filled in when setObjects() is called
  this.objects = [];
  this.sampleCount = 0;
  this.tracerProgram = null;
}

PathTracer.prototype.setObjects = function(objects, trianglesCount, indexTextureSize) {
    this.trianglesCount = trianglesCount;
    this.uniforms = {};
    this.sampleCount = 0;
    this.objects = objects;

    // create tracer shader
    if(this.tracerProgram != null) {
      gl.deleteProgram(this.shaderProgram);
    }
    if (objload == true) {

          this.tracerProgram = compileShader(tracerVertexSource, makeTracerFragmentSource2(objects, trianglesCount, indexTextureSize));
    } else {
          //console.log(trianglesCount);
          this.tracerProgram = compileShader(tracerVertexSource, makeTracerFragmentSource(objects));
    }
    this.tracerVertexAttribute = gl.getAttribLocation(this.tracerProgram, 'vertex');
    gl.enableVertexAttribArray(this.tracerVertexAttribute);
    window.enableDraw();
};

PathTracer.prototype.update = function(matrix, timeSinceStart, textureVI) {
  //if (this.trianglesCount > 0) {
    // calculate uniforms
    for(var i = 0; i < this.objects.length; i++) {
      this.objects[i].setUniforms(this);
    }
    this.uniforms.eye = eye;
    this.uniforms.glossiness = glossiness;
    this.uniforms.ray00 = getEyeRay(matrix, -1, -1);
    this.uniforms.ray01 = getEyeRay(matrix, -1, +1);
    this.uniforms.ray10 = getEyeRay(matrix, +1, -1);
    this.uniforms.ray11 = getEyeRay(matrix, +1, +1);
    this.uniforms.timeSinceStart = timeSinceStart;
    this.uniforms.textureWeight = this.sampleCount / (this.sampleCount + 1);

    this.uniforms.textureA = new String("0");
    this.uniforms.textureV = new String("1");
    this.uniforms.textureI = new String("2");

    // set uniforms
    gl.useProgram(this.tracerProgram);
    setUniforms(this.tracerProgram, this.uniforms);

    // render to texture
    gl.useProgram(this.tracerProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
    if (textureVI != 0) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textureVI[0]);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, textureVI[1]);
    }  
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures[1], 0);
    gl.vertexAttribPointer(this.tracerVertexAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (textureVI != 0) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null); 

    // ping pong textures
    this.textures.reverse();
    this.sampleCount++;
 // }
};

PathTracer.prototype.render = function() {
  gl.useProgram(this.renderProgram);
  gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
  gl.vertexAttribPointer(this.renderVertexAttribute, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

////////////////////////////////////////////////////////////////////////////////
// class Renderer
////////////////////////////////////////////////////////////////////////////////

function Renderer() {

  this.objects = [];
  this.selectedObject = null;
  this.pathTracer = new PathTracer();  
}

Renderer.prototype.setObjects = function(objects, trianglesCount, indexTextureSize) {
  this.objects = objects;
  this.selectedObject = null;
  if (objload == true) {
    this.pathTracer.setObjects(objects, trianglesCount, indexTextureSize);
  } else {
      this.pathTracer.setObjects(objects,0,0);
  }
};

Renderer.prototype.update = function(modelviewProjection, timeSinceStart, textureVI) {
  var vwidth = (Math.random() * 2 - 1 ) * (1 / window.innerWidth);
  var vheight = (Math.random() * 2 - 1 ) * (1 / window.innerHeight);
  var jitter = Matrix.Translation(Vector.create([vwidth, vheight, 0])).multiply(1 / 1024);
  var inverse = jitter.multiply(modelviewProjection).inverse();
  this.modelviewProjection = modelviewProjection;
  if (objload != true) {
      this.pathTracer.update(inverse, timeSinceStart, textureVI); } 
  else 
      {this.pathTracer.update(inverse, timeSinceStart, textureVI);
  }
};

Renderer.prototype.render = function() {
  this.pathTracer.render();

};

////////////////////////////////////////////////////////////////////////////////
// class UI
////////////////////////////////////////////////////////////////////////////////

function UI() {
  this.renderer = new Renderer();           // | pozri hore - trieda Renderer
  this.moving = false;
  this.perspective = perspective;
  this.tex = [];
}

UI.prototype.setObjects = function(objects) {

  this.objects = objects;
  if (objload == !true) {
          if (this.tex != []) { this.tex = []};
      this.objects.splice(0, 0, new Light());
      //this.objCount = this.objects.length-1;
      this.renderer.setObjects(this.objects,0,0);
  } else {
      this.objects.splice(0, 0, new Light());
      this.objCount = this.objects.length-1;
      this.renderer.setObjects(this.objects, this.trianglesCount, this.indexTextureWidth); 
  };
}


UI.prototype.loader = function() {
  //console.log('input je ', objectparse);
  objload = true;
  var objStr = document.getElementById( "model.obj").innerHTML;
  var mesh = new OBJ.Mesh(objStr);
  OBJ.initMeshBuffers(gl,mesh); 
  console.log('nacitam toto ', mesh ); // vrcholy', mesh.vertexBuffer, 'indices' , mesh.indices);

    ////////// initialization of packing vertex data to textures ///////////////////////

  var vertexTextureWidth = Math.ceil(Math.sqrt(mesh.vertices.length / 3.0));
  console.log(' dlzka V', vertexTextureWidth );
  this.indexTextureWidth = Math.ceil(Math.sqrt( mesh.indices.length ));
  console.log(' dlzka I', this.indexTextureWidth ); 
  this.trianglesCount = Math.floor(mesh.indices.length / 3);

  var vertexArray =  [];
  for(var i = 0; i < mesh.vertices.length; ++i)
  {
    vertexArray.push(mesh.vertices[i]);
  }   
  for(var i = mesh.vertices.length; i < vertexTextureWidth*vertexTextureWidth*3; ++i)
  {
    vertexArray.push(0);
  }

  var indexArray  = [];
  var factor = 65535.0 / (vertexTextureWidth - 1.0)

  for(var i = 0; i < mesh.indices.length; ++i)
  {
    var x = mesh.indices[i] % vertexTextureWidth;
    var y = Math.floor(mesh.indices[i] / vertexTextureWidth);
    indexArray.push(Math.floor(x * 255 / (vertexTextureWidth - 1)));
    indexArray.push(Math.floor(y * 255 / (vertexTextureWidth - 1)));

  }
  for(var i = mesh.indices.length; i < this.indexTextureWidth*this.indexTextureWidth; ++i)
  {
    indexArray.push(0);
    indexArray.push(0);
  }

  var type = gl.getExtension('OES_texture_float') ? gl.FLOAT : gl.UNSIGNED_BYTE;



  for(var i = 0; i < 2; i++) {
    this.tex.push(gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    if (i == 0)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, vertexTextureWidth, vertexTextureWidth, 0, gl.RGB, gl.FLOAT, new Float32Array(vertexArray));
    else
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, this.indexTextureWidth, this.indexTextureWidth, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, new Uint8Array(indexArray));
    if( !gl.isTexture(this.tex[i]) ) { console.log("Error: Texture is invalid");}
  }

  console.log(this.tex[0], this.tex[1]);
  ui.setObjects([]);

}

UI.prototype.update = function(timeSinceStart) {
  this.modelview = makeLookAt(eye.elements[0], eye.elements[1], eye.elements[2], 0, 0, 0, 0, 1, 0);
  var aspect = window.innerWidth / window.innerHeight;
  var per = 1 / aspect;
  this.projection = makePerspective(this.perspective, aspect, 0.1, 100);
  this.modelviewProjection = this.projection.multiply(this.modelview);
  this.renderer.update(this.modelviewProjection, timeSinceStart, this.tex);
};

UI.prototype.mouseDown = function(x, y) {
  var t;
  var origin = eye;
  var ray = getEyeRay(this.modelviewProjection.inverse(), (x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);

  // test the selection box first
  if(this.renderer.selectedObject != null) {
    var minBounds = this.renderer.selectedObject.getMinCorner();
    var maxBounds = this.renderer.selectedObject.getMaxCorner();
    t = Cube.intersect(origin, ray, minBounds, maxBounds);

    if(t < Number.MAX_VALUE) {
      var hit = origin.add(ray.multiply(t));

      if(Math.abs(hit.elements[0] - minBounds.elements[0]) < 0.001) this.movementNormal = Vector.create([-1, 0, 0]);
      else if(Math.abs(hit.elements[0] - maxBounds.elements[0]) < 0.001) this.movementNormal = Vector.create([+1, 0, 0]);
      else if(Math.abs(hit.elements[1] - minBounds.elements[1]) < 0.001) this.movementNormal = Vector.create([0, -1, 0]);
      else if(Math.abs(hit.elements[1] - maxBounds.elements[1]) < 0.001) this.movementNormal = Vector.create([0, +1, 0]);
      else if(Math.abs(hit.elements[2] - minBounds.elements[2]) < 0.001) this.movementNormal = Vector.create([0, 0, -1]);
      else this.movementNormal = Vector.create([0, 0, +1]);

      this.movementDistance = this.movementNormal.dot(hit);
      this.originalHit = hit;
      this.moving = true;

      return true;
    }
  }

  t = Number.MAX_VALUE;
  this.renderer.selectedObject = null;

  return (t < Number.MAX_VALUE);
};

UI.prototype.mouseMove = function(x, y) {
  if(this.moving) {
    var origin = eye;
    var ray = getEyeRay(this.modelviewProjection.inverse(), (x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);

    var t = (this.movementDistance - this.movementNormal.dot(origin)) / this.movementNormal.dot(ray);
    var hit = origin.add(ray.multiply(t));
    this.renderer.selectedObject.temporaryTranslate(hit.subtract(this.originalHit));

    // clear the sample buffer
    this.renderer.pathTracer.sampleCount = 0;
  }
};

UI.prototype.mouseUp = function(x, y) {
  if(this.moving) {
    var origin = eye;
    var ray = getEyeRay(this.modelviewProjection.inverse(), (x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);

    var t = (this.movementDistance - this.movementNormal.dot(origin)) / this.movementNormal.dot(ray);
    var hit = origin.add(ray.multiply(t));
    this.renderer.selectedObject.temporaryTranslate(Vector.create([0, 0, 0]));
    this.renderer.selectedObject.translate(hit.subtract(this.originalHit));
    this.moving = false;
  }
};

UI.prototype.render = function() {
  this.renderer.render();
};

UI.prototype.updateMaterial = function() {
  var newMaterial = parseInt(document.getElementById('material').value, 10);
  if(material != newMaterial) {
    material = newMaterial;
    this.renderer.setObjects(this.objects);
  }
};

UI.prototype.updateEnvironment = function() {
  var newEnvironment = parseInt(document.getElementById('environment').value, 10);
  if(environment != newEnvironment) {
    environment = newEnvironment;
    this.renderer.setObjects(this.objects);
  }
};

UI.prototype.updateGlossiness = function() {
  var newGlossiness = parseFloat(document.getElementById('glossiness').value);
  if(isNaN(newGlossiness)) newGlossiness = 0;
  newGlossiness = Math.max(0, Math.min(1, newGlossiness));
  if(material == MATERIAL_GLOSSY && glossiness != newGlossiness) {
    this.renderer.pathTracer.sampleCount = 0;

  }
  glossiness = newGlossiness;
};


////////////////////////////////////////////////////////////////////////////////
// main program
////////////////////////////////////////////////////////////////////////////////

var gl;
var ui;
var error;
var canvas;
var inputFocusCount = 0;


var perspective = 75;
var angleX = 0;
var angleY = 0;
var zoomZ = 2.5;
var eye = Vector.create([0, 0, 0]);
var light = Vector.create([0.0, 14.0, 15.5]);
var lightVal = 1.8;
var objload = false;

var nextObjectId = 0;

var MATERIAL_DIFFUSE = 0;
var MATERIAL_MIRROR = 1;
var MATERIAL_GLOSSY = 2;
var material = MATERIAL_DIFFUSE;
var glossiness = 0.6;

var YELLOW_BLUE_CORNELL_BOX = 0;
var ORANGE_PURPLE_CORNELL_BOX = 1;
var environment = ORANGE_PURPLE_CORNELL_BOX;



function tick(timeSinceStart) {
  eye.elements[0] = zoomZ * Math.sin(angleY) * (Math.cos(angleX)*2);
  eye.elements[1] = zoomZ * Math.sin(angleX);
  eye.elements[2] = zoomZ * Math.cos(angleY) * (Math.cos(angleX)*2);

  document.getElementById('glossiness-factor').style.display = (material == MATERIAL_GLOSSY) ? 'inline' : 'none';

  ui.updateMaterial();                   
  ui.updateGlossiness();                  
  ui.updateEnvironment();                   
  ui.update(timeSinceStart);                
  ui.render();
}

function makeStacks() {
  var objects = [];
  var objload = false;

  // lower level
  objects.push(new Cube(Vector.create([-0.5, -0.75, -0.5]), Vector.create([0.5, -0.7, 0.5]), nextObjectId++));

  // further poles
  objects.push(new Cube(Vector.create([-0.45, -1, -0.45]), Vector.create([-0.4, -0.45, -0.4]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.4, -1, -0.45]), Vector.create([0.45, -0.45, -0.4]), nextObjectId++));
  objects.push(new Cube(Vector.create([-0.45, -1, 0.4]), Vector.create([-0.4, -0.45, 0.45]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.4, -1, 0.4]), Vector.create([0.45, -0.45, 0.45]), nextObjectId++));

  // upper level
  objects.push(new Cube(Vector.create([-0.3, -0.5, -0.3]), Vector.create([0.3, -0.45, 0.3]), nextObjectId++));

  // closer poles
  objects.push(new Cube(Vector.create([-0.25, -0.7, -0.25]), Vector.create([-0.2, -0.25, -0.2]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.2, -0.7, -0.25]), Vector.create([0.25, -0.25, -0.2]), nextObjectId++));
  objects.push(new Cube(Vector.create([-0.25, -0.7, 0.2]), Vector.create([-0.2, -0.25, 0.25]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.2, -0.7, 0.2]), Vector.create([0.25, -0.25, 0.25]), nextObjectId++));

  // upper level
  objects.push(new Cube(Vector.create([-0.25, -0.25, -0.25]), Vector.create([0.25, -0.2, 0.25]), nextObjectId++));

  return objects;
}

function makeTableAndChair() {
  var objects = [];
  var objload = false;

  // table top
  objects.push(new Cube(Vector.create([-0.5, -1.3, -0.5]), Vector.create([0.3, -1.25, 0.5]), nextObjectId++));

  // table legs
  objects.push(new Cube(Vector.create([-0.45, -1.9, -0.45]), Vector.create([-0.4, -1.25, -0.4]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.2, -1.9, -0.45]), Vector.create([0.25, -1.25, -0.4]), nextObjectId++));
  objects.push(new Cube(Vector.create([-0.45, -1.9, 0.4]), Vector.create([-0.4, -1.25, 0.45]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.2, -1.9, 0.4]), Vector.create([0.25, -1.25, 0.45]), nextObjectId++));

  // chair seat
  objects.push(new Cube(Vector.create([0.3, -1.5, -0.2]), Vector.create([0.7, -1.45, 0.2]), nextObjectId++));

  // chair legs
  objects.push(new Cube(Vector.create([0.3, -1.9, -0.2]), Vector.create([0.35, -1.5, -0.15]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.3, -1.9, 0.15]), Vector.create([0.35, -1.5, 0.2]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.65, -1.9, -0.2]), Vector.create([0.7, -0.8, -0.15]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.65, -1.9, 0.15]), Vector.create([0.7, -0.8, 0.2]), nextObjectId++));

  // chair back
  objects.push(new Cube(Vector.create([0.65, -0.85, -0.15]), Vector.create([0.7, -0.8, 0.15]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.65, -1.45, -0.09]), Vector.create([0.7, -0.8, -0.03]), nextObjectId++));
  objects.push(new Cube(Vector.create([0.65, -1.45, 0.03]), Vector.create([0.7, -0.8, 0.09]), nextObjectId++));

  // sphere on table
  objects.push(new Sphere(Vector.create([-0.1, -1.0, 0]), 0.25, nextObjectId++));

  // another table near to blue
  // table bottom
  objects.push(new Cube(Vector.create([-1.6, -1.90, -1.6]), Vector.create([-1.0,-1.82,-1.0]), nextObjectId++));
  //table leg
  objects.push(new Cylinder(Vector.create([-1.3, -1.52, -1.3]), 0.12, 0.3, 1.0, nextObjectId++));
  // table top
  objects.push(new Cylinder(Vector.create([-1.3, -1.22, -1.3]), 0.5, 0.02, 1.0, nextObjectId++));  
  // cube on table
  //objects.push(new Cube(Vector.create([-1.5, -1.18, -1.5]), Vector.create([-1.1, -0.78, -1.1]), nextObjectId++));

  // another table near to yellow
  // table bottom

  objects.push(new Cube(Vector.create([1.0, -1.90, -1.6]), Vector.create([1.6,-1.82, -1.0]), nextObjectId++));
  //table leg
  objects.push(new Cylinder(Vector.create([1.3, -1.52, -1.3]), 0.12, 0.3, 1.0, nextObjectId++));
  // table top
  objects.push(new Cylinder(Vector.create([1.3, -1.22, -1.3]), 0.5, 0.02, 1.0, nextObjectId++));  
  // cube on table
  //objects.push(new Cube(Vector.create([1.5, -1.18, -1.5]), Vector.create([1.1, -0.78, -1.1]), nextObjectId++));
  return objects;
}

function makeSphereCubePlane() {
  var objects = [];
  var objload = false;
  var ce = 10.0 * epsilon;
  objects.push(new Cube(Vector.create([-2.1 ,-0.15, -0.15]), Vector.create([2.1, 0.15, 0.15]), nextObjectId++));  
  objects.push(new Cube(Vector.create([-2.1 ,-1.15, -0.15]), Vector.create([2.1, -0.85, 0.15]), nextObjectId++));  
  objects.push(new Cube(Vector.create([-2.1 ,0.85, -0.15]), Vector.create([2.1, 1.15, 0.15]), nextObjectId++));  
  objects.push(new Cube(Vector.create([-0.15 ,-2.1, -0.15]), Vector.create([0.15, 2.1, 0.15]), nextObjectId++));  
  objects.push(new Cube(Vector.create([-1.15 ,-2.1, -0.15]), Vector.create([-0.85, 2.1, 0.15]), nextObjectId++)); 
  objects.push(new Cube(Vector.create([0.85 ,-2.1, -0.15]), Vector.create([1.15, 2.1, 0.15]), nextObjectId++)); 
  objects.push(new Sphere(Vector.create([-0.50, -0.50, 0.0]), 0.25, nextObjectId++));
  objects.push(new Cube(Vector.create([0.30, 0.30, -0.15]), Vector.create([0.65, 0.65, 0.15]), nextObjectId++));  
  objects.push(new Cylinder(Vector.create([-0.47, 0.47, 0.0]), 0.25, ce ,2.0, nextObjectId++));
  objects.push(new Cube(Vector.create([0.30, -0.65,  0.05  ]), Vector.create([0.65, -0.30, 0.05 + ce ]), nextObjectId++)); 
  objects.push(new Cylinder(Vector.create([-0.47, 1.40, 0.0]), 0.25, 0.15 ,1.0, nextObjectId++)); 
  objects.push(new Triangle(Vector.create([0.35, 1.30, 0.0 - ce]), Vector.create([0.65, 1.30, 0.0 - ce]),Vector.create([0.47, 1.60, 0.0 -ce]), false, nextObjectId++));
  return objects;
}

function makeSphereColumn() {
  var objects = [];
  var objload = false;
  objects.push(new Sphere(Vector.create([0, 0.75, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0, 0.25, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0, -0.25, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0, -0.75, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.25, 0.75, 0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.25, 0.25, 0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.25, -0.25, 0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.25, -0.75, 0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.50, 0.75, 0.50]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.50, 0.25, 0.50]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.50, -0.25, 0.50]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.50, -0.75, 0.50]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.25, 0.75, -0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.25, 0.25, -0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.25, -0.25, -0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.25, -0.75, -0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.50, 0.75, -0.50]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.50, 0.25, -0.50]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.50, -0.25, -0.50]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.50, -0.75, -0.50]), 0.25, nextObjectId++));

  return objects;
}

function makeTriangles() {
  var objects = [];
  var objload = false;
  objects.push(new Triangle(Vector.create([0.00, 1.00, -0.20]), Vector.create([0.20, 1.00, -0.20]),Vector.create([0.10, 1.20, -0.40]), false, nextObjectId++));
  //objects.push(new Triangle(Vector.create([0.0, 0.00, -0.20001]), Vector.create([0.10, 0.20, -0.20001]),Vector.create([0.20, 0.00, -0.200001]), true, nextObjectId++));
  objects.push(new Triangle(Vector.create([0.20, 1.00, -0.20]), Vector.create([0.40, 1.00, -0.20]),Vector.create([0.30, 1.20, -0.40]), false, nextObjectId++));
  //objects.push(new Triangle(Vector.create([0.20, 0.00, -0.20001]), Vector.create([0.30, 0.20, -0.20001]),Vector.create([0.40, 0.00, -0.200001]), true, nextObjectId++));
  objects.push(new Triangle(Vector.create([0.40, 1.00, -0.20]), Vector.create([0.60, 1.00, -0.20]),Vector.create([0.50, 1.20, -0.40]), false, nextObjectId++));
  //objects.push(new Triangle(Vector.create([0.40, 0.00, -0.20001]), Vector.create([0.50, 0.20, -0.20001]),Vector.create([0.60, 0.00, -0.200001]), true, nextObjectId++));
  objects.push(new Triangle(Vector.create([-0.20, 1.00, -0.20]), Vector.create([0.00, 1.00, -0.20]),Vector.create([-0.10, 1.20, -0.40]), false, nextObjectId++));
 // objects.push(new Triangle(Vector.create([-0.20, 0.00, -0.20001]), Vector.create([-0.10, 0.20, -0.20001]),Vector.create([0.00, 0.00, -0.200001]), true, nextObjectId++));
  objects.push(new Triangle(Vector.create([0.10, 1.20, -0.20]), Vector.create([0.30, 1.20, -0.20]),Vector.create([0.20, 1.40, -0.40]), false, nextObjectId++));
  //objects.push(new Triangle(Vector.create([0.10, 0.20, -0.200001]), Vector.create([0.20, 0.40, -0.200001]),Vector.create([0.30, 0.20, -0.200001]), true, nextObjectId++));  
  objects.push(new Triangle(Vector.create([0.30, 1.20, -0.20]), Vector.create([0.50, 1.20, -0.20]),Vector.create([0.40, 1.40, -0.40]), false, nextObjectId++));
 // objects.push(new Triangle(Vector.create([0.30, 0.20, -0.200001]), Vector.create([0.40, 0.40, -0.200001]),Vector.create([0.50, 0.20, -0.200001]), true, nextObjectId++));
  objects.push(new Triangle(Vector.create([-0.10, 1.20, -0.20]), Vector.create([0.10, 1.20, -0.20]),Vector.create([0.00, 1.40, -0.40]), false, nextObjectId++));
  //objects.push(new Triangle(Vector.create([-0.10, 0.20, -0.200001]), Vector.create([0.00, 0.40, -0.200001]),Vector.create([0.10, 0.20, -0.200001]), true, nextObjectId++));
  objects.push(new Triangle(Vector.create([0.20, 1.40, -0.20]), Vector.create([0.40, 1.40, -0.20]),Vector.create([0.30, 1.60, -0.40]), false, nextObjectId++));
//  objects.push(new Triangle(Vector.create([0.20, 0.40, -0.200001]), Vector.create([0.30, 0.60, -0.200001]),Vector.create([0.40, 0.40, -0.200001]), true, nextObjectId++));
  objects.push(new Triangle(Vector.create([0.00, 1.40, -0.20]), Vector.create([0.20, 1.40, -0.20]),Vector.create([0.10, 1.60, -0.40]), false, nextObjectId++));
//  objects.push(new Triangle(Vector.create([0.00, 0.40, -0.200001]), Vector.create([0.10, 0.60, -0.200001]),Vector.create([0.20, 0.40, -0.200001]), true, nextObjectId++));

  return objects;
}

function makeCubeAndSpheres() {
  var objects = [];
  var objload = false;
  objects.push(new Cube(Vector.create([-0.25, -0.25, -0.25]), Vector.create([0.25, 0.25, 0.25]), nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.25, 0, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([+0.25, 0, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0, -0.25, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0, +0.25, 0]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0, 0, -0.25]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0, 0, +0.25]), 0.25, nextObjectId++));
  return objects;
}

function makeSpherePyramid() {
  var root3_over4 = 0.433012701892219;
  var root3_over6 = 0.288675134594813;
  var root6_over6 = 0.408248290463863;
  var objects = [];
  var objload = false;

  // first level
  objects.push(new Sphere(Vector.create([-0.5, -0.75, -root3_over6]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.0, -0.75, -root3_over6]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.5, -0.75, -root3_over6]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.25, -0.75, root3_over4 - root3_over6]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.25, -0.75, root3_over4 - root3_over6]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.0, -0.75, 2.0 * root3_over4 - root3_over6]), 0.25, nextObjectId++));

  // second level
  objects.push(new Sphere(Vector.create([0.0, -0.75 + root6_over6, root3_over6]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([-0.25, -0.75 + root6_over6, -0.5 * root3_over6]), 0.25, nextObjectId++));
  objects.push(new Sphere(Vector.create([0.25, -0.75 + root6_over6, -0.5 * root3_over6]), 0.25, nextObjectId++));

  // third level
  objects.push(new Sphere(Vector.create([0.0, -0.75 + 2.0 * root6_over6, 0.0]), 0.25, nextObjectId++));

  return objects;
}

var XNEG = 0, XPOS = 1, YNEG = 2, YPOS = 3, ZNEG = 4, ZPOS = 5;

function addRecursiveSpheresBranch(objects, center, radius, depth, dir) {
  objects.push(new Sphere(center, radius, nextObjectId++));
  if(depth--) {
    if(dir != XNEG) addRecursiveSpheresBranch(objects, center.subtract(Vector.create([radius * 1.5, 0, 0])), radius / 2, depth, XPOS);
    if(dir != XPOS) addRecursiveSpheresBranch(objects, center.add(Vector.create([radius * 1.5, 0, 0])),      radius / 2, depth, XNEG);
    
    if(dir != YNEG) addRecursiveSpheresBranch(objects, center.subtract(Vector.create([0, radius * 1.5, 0])), radius / 2, depth, YPOS);
    if(dir != YPOS) addRecursiveSpheresBranch(objects, center.add(Vector.create([0, radius * 1.5, 0])),      radius / 2, depth, YNEG);
    
    if(dir != ZNEG) addRecursiveSpheresBranch(objects, center.subtract(Vector.create([0, 0, radius * 1.5])), radius / 2, depth, ZPOS);
    if(dir != ZPOS) addRecursiveSpheresBranch(objects, center.add(Vector.create([0, 0, radius * 1.5])),      radius / 2, depth, ZNEG);
  }
}

function makeRecursiveSpheres() {
  var objects = [];
  var objload = false;
  addRecursiveSpheresBranch(objects, Vector.create([0, 0, 0]), 0.3, 2, -1);
  return objects;
}

window.onload = function() {
  gl = null;
  error = document.getElementById('error');
  canvas = document.getElementById('canvas');

  canvas.width = window.innerWidth; 
  canvas.height = window.innerHeight; 
  console.log(canvas.width, canvas.height); 
  try { gl = canvas.getContext('experimental-webgl'); } catch(e) {}

  if(gl) {

    // keep track of whether an <input> is focused or not (will be no only if inputFocusCount == 0)
    var inputs = document.getElementsByTagName('input');
    for(var i= 0; i < inputs.length; i++) {
      inputs[i].onfocus = function(){ inputFocusCount++; };
      inputs[i].onblur = function(){ inputFocusCount--; };
    }

    window.enableDraw = function(){
      window.repeatCounter = 0;
      window.repeatDraw = true;
    };
    window.enableDraw();

    material = parseInt(document.getElementById('material').value, 10);
    environment = parseInt(document.getElementById('environment').value, 10);
    ui = new UI();
    ui.setObjects(makeSphereColumn());
    //ui.loader();

    var start = new Date();
    error.style.zIndex = -1;

    var repeatID = setInterval(function(){
      if (repeatDraw)
        tick((new Date() - start) * 0.001);
      if (repeatDraw && (++repeatCounter === sampling))
        repeatDraw = false;
    }, 1000 / 8);
  } else {
    error.innerHTML = 'Your browser does not support WebGL.<br>Please see <a href="http://www.khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">Getting a WebGL Implementation</a>.';
  }
};

function elementPos(element) {
  var x = 0, y = 0;
  while(element.offsetParent) {
    x += element.offsetLeft;
    y += element.offsetTop;
    element = element.offsetParent;
  }
  return { x: x, y: y };
}

function eventPos(event) {
  return {
    x: event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft,
    y: event.clientY + document.body.scrollTop + document.documentElement.scrollTop
  };
}

function canvasMousePos(event) {
  var mousePos = eventPos(event);
  var canvasPos = elementPos(canvas);
  return {
    x: mousePos.x - canvasPos.x,
    y: mousePos.y - canvasPos.y
  };
}

var mouseDown = false, oldX, oldY;

document.onmousedown = function(event) {
  var mouse = canvasMousePos(event);
  oldX = mouse.x;
  oldY = mouse.y;

  if(mouse.x >= 0 && mouse.x < canvas.width && mouse.y >= 0 && mouse.y < canvas.height) {
    mouseDown = !ui.mouseDown(mouse.x, mouse.y);

    // disable selection because dragging is used for rotating the camera and moving objects
    return false;
  }

  return true;
};

document.onmousemove = function(event) {
  var mouse = canvasMousePos(event);

  if(mouseDown) {
    // update the angles based on how far we moved since last time
    angleY -= (mouse.x - oldX) * 0.01;
    angleX += (mouse.y - oldY) * 0.01;

    // don't go upside down
    angleX = Math.max(angleX, -Math.PI / 2 + 0.01);
    angleX = Math.min(angleX, Math.PI / 2 - 0.01);

    // clear the sample buffer
    ui.renderer.pathTracer.sampleCount = 0;

    // remember this coordinate
    oldX = mouse.x;
    oldY = mouse.y;

    window.enableDraw();
  } else {
    var canvasPos = elementPos(canvas);
    ui.mouseMove(mouse.x, mouse.y);
  }
};

document.onmouseup = function(event) {
  mouseDown = false;

  var mouse = canvasMousePos(event);
  ui.mouseUp(mouse.x, mouse.y);
};

document.onkeydown = function(event) {
  // if there are no <input> elements focused
    if(event.keyCode == 38 ) {
     zoomZ = zoomZ - 0.1;
     var mouse = canvasMousePos(event); 
     ui.renderer.pathTracer.sampleCount = 0;
     return false;
    }

    if(event.keyCode == 40) {
     zoomZ = zoomZ + 0.1;
     var mouse = canvasMousePos(event); 
     ui.renderer.pathTracer.sampleCount = 0;
     return false;
    }   


};
