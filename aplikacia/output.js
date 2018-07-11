precision highp float;
uniform vec3 eye;
varying vec3 initialRay;
uniform float textureWeight;
uniform float timeSinceStart;
uniform sampler2D textureA;
uniform sampler2D textureV;
uniform sampler2D textureI;
uniform float glossiness;
uniform vec2 uScreenResolution;
uniform float screenWidth;
uniform float screenHeight;
vec3 roomCubeMin = vec3(-16.0, -10.9, -16.0);
vec3 roomCubeMax = vec3(16.0, 10.9, 16.0);
uniform vec3 light;
uniform vec3 sphereCenter0;
uniform float sphereRadius0;
uniform vec3 sphereCenter1;
uniform float sphereRadius1;
uniform vec3 sphereCenter2;
uniform float sphereRadius2;
uniform vec3 sphereCenter3;
uniform float sphereRadius3;
uniform vec3 sphereCenter4;
uniform float sphereRadius4;
uniform vec3 sphereCenter5;
uniform float sphereRadius5;
uniform vec3 sphereCenter6;
uniform float sphereRadius6;
uniform vec3 sphereCenter7;
uniform float sphereRadius7;
uniform vec3 sphereCenter8;
uniform float sphereRadius8;
uniform vec3 sphereCenter9;
uniform float sphereRadius9;
uniform vec3 sphereCenter10;
uniform float sphereRadius10;
uniform vec3 sphereCenter11;
uniform float sphereRadius11;
uniform vec3 sphereCenter12;
uniform float sphereRadius12;
uniform vec3 sphereCenter13;
uniform float sphereRadius13;
uniform vec3 sphereCenter14;
uniform float sphereRadius14;
uniform vec3 sphereCenter15;
uniform float sphereRadius15;
uniform vec3 sphereCenter16;
uniform float sphereRadius16;
uniform vec3 sphereCenter17;
uniform float sphereRadius17;
uniform vec3 sphereCenter18;
uniform float sphereRadius18;
uniform vec3 sphereCenter19;
uniform float sphereRadius19;
vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax, int id, inout float minT, inout int hitID) {
	vec3 tMin = (cubeMin - origin) / ray;
	vec3 tMax = (cubeMax - origin) / ray;
	vec3 t1 = min(tMin, tMax);
	vec3 t2 = max(tMin, tMax);
	float tNear = max(max(t1.x, t1.y), t1.z);
	float tFar = min(min(t2.x, t2.y), t2.z);
	if ((tNear > 0.0) && (tNear < minT) && (tNear < tFar)) {
		minT = tNear;
		hitID = id;
	}
	return vec2(tNear, tFar);
}
vec3 normalForCube(vec3 hit, vec3 cubeMin, vec3 cubeMax) {
	if (hit.x < cubeMin.x + 0.0001) return vec3(-1.0, 0.0, 0.0);
	else if (hit.x > cubeMax.x - 0.0001) return vec3(1.0, 0.0, 0.0);
	else if (hit.y < cubeMin.y + 0.0001) return vec3(0.0, -1.0, 0.0);
	else if (hit.y > cubeMax.y - 0.0001) return vec3(0.0, 1.0, 0.0);
	else if (hit.z < cubeMin.z + 0.0001) return vec3(0.0, 0.0, -1.0);
	else return vec3(0.0, 0.0, 1.0);
}
float intersectSphere(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius, int id, inout float minT, inout int hitID) {
	vec3 toSphere = origin - sphereCenter;
	float a = dot(ray, ray);
	float b = 2.0 * dot(toSphere, ray);
	float c = dot(toSphere, toSphere) - sphereRadius * sphereRadius;
	float discriminant = b * b - 4.0 * a * c;
	if (discriminant > 0.0) {
		float t = (-b - sqrt(discriminant)) / (2.0 * a);
		if (t > 0.0) {
			if (t < minT) {
				minT = t;
				hitID = id;
			}
			return t;
		}
		return 10000.0;
	}
	return 10000.0;
}
vec3 normalForSphere(vec3 hit, vec3 sphereCenter, float sphereRadius) {
	return (hit - sphereCenter) / sphereRadius;
}
float intersectTriangle(vec3 origin, vec3 ray, vec3 v1, vec3 v2, vec3 v3, bool culling, int id, inout float minT, inout int hitID) {
	vec3 edge1 = v2 - v1;
	vec3 edge2 = v3 - v1;
	vec3 pvec = cross(ray, edge2);
	float det = dot(edge1, pvec);
	float inv_det = 1.0 / det;
	float d = culling ? det : abs(det);
	if (d < 0.000001) {
		return 10000.0;
	}
	vec3 tvec = origin - v1;
	float u = dot(tvec, pvec) * inv_det;
	if (u < 0.0 || u > 1.0) {
		return 10000.0;
	}
	vec3 qvec = cross(tvec, edge1);
	float v = dot(ray, qvec) * inv_det;
	if (v < 0.0 || (u + v) > 1.0) {
		return 10000.0;
	}
	float t = dot(edge2, qvec);
	t = t * inv_det;
	if ((t > 0.0) && (t < minT)) {
		minT = t;
		hitID = id;
	}
	return t;
}
vec3 normalForTriangle(vec3 ray, vec3 hit, vec3 v1, vec3 v2, vec3 v3, bool cull) {
	vec3 edge1 = v2 - v1;
	vec3 edge2 = v3 - v1;
	vec3 n = cross(normalize(edge1), normalize(edge2));
	return (cull || dot(n, ray) < 0.0) ? n : -n;
}
vec2 intersectCylinder(vec3 origin, vec3 ray, vec3 CylinderCenter, float CylinderRadius, float CylinderHeight, float CylinderDirection, int id, inout float minT, inout int hitID) {
	if (CylinderDirection < 0.5) {
		origin = origin - CylinderCenter;
		origin = vec3(origin.y, -origin.x, origin.z);
		origin = origin + CylinderCenter;
		ray = vec3(ray.y, -ray.x, ray.z);
	} else if (CylinderDirection > 1.5) {
		origin = origin - CylinderCenter;
		origin = vec3(origin.x, origin.z, -origin.y);
		origin = origin + CylinderCenter;
		ray = vec3(ray.x, ray.z, -ray.y);
	}
	vec3 toSphere = origin - CylinderCenter;
	float cylHeight = CylinderHeight;
	float r2 = CylinderRadius * CylinderRadius;
	float h2 = cylHeight * cylHeight;
	float t = 0.0;
	vec2 origCircDist = origin.xz - CylinderCenter.xz;
	if (dot(origCircDist, origCircDist) < r2) {
		vec2 Y = vec2(CylinderCenter.y - cylHeight, CylinderCenter.y + cylHeight);
		vec2 t2 = (Y - origin.yy) / ray.y;
		vec2 sorted = vec2(min(t2.x, t2.y), max(t2.x, t2.y));
		if (sorted.x > 0.0) {
			t = sorted.x - 0.0001;
		} else if (sorted.y > 0.0) {
			t = sorted.y + 0.0001;
		} else {
			return vec2(10000.0, 10000.0);
		}
		vec3 newP = origin + (t * ray);
		vec2 circ = CylinderCenter.xz - newP.xz;
		if (dot(circ, circ) <= r2 && (t < minT)) {
			minT = t;
			hitID = id;
			return vec2(t, -1.0);
		}
	} else {
		float a = dot(ray.xz, ray.xz);
		float b = 2.0 * dot(toSphere.xz, ray.xz);
		float c = dot(toSphere.xz, toSphere.xz) - r2;
		float discriminant = b * b - 4.0 * a * c;
		if (discriminant > 0.0) {
			t = (-b - sqrt(discriminant)) / (2.0 * a);
			if (t > 0.0) {
				vec3 v = (origin + (t * ray)) - CylinderCenter;
				float s = dot(v, v) - r2;
				if (s <= h2 && (t < minT)) {
					minT = t;
					hitID = id;
					return vec2(t, 1.0);
				} else {
					vec2 Y = vec2(CylinderCenter.y - cylHeight, CylinderCenter.y + cylHeight);
					vec2 t2 = (Y - origin.yy) / ray.y;
					vec2 sorted = vec2(min(t2.x, t2.y), max(t2.x, t2.y));
					if (sorted.x > 0.0) {
						t = sorted.x - 0.0001;
					} else if (sorted.y > 0.0) {
						t = sorted.y + 0.0001;
					} else {
						return vec2(10000.0, 10000.0);
					}
					vec3 newP = origin + (t * ray);
					vec2 circ = CylinderCenter.xz - newP.xz;
					if (dot(circ, circ) <= r2 && (t < minT)) {
						minT = t;
						hitID = id;
						return vec2(t, 0.0);
					}
				}
			}
		}
	}
	return vec2(10000.0, 10000.0);
}
vec3 normalForCylinder(vec3 hit, float helper, vec3 CylinderCenter, float CylinderRadius, float CylinderDirection) {
	if (CylinderDirection < 0.5) {
		if (helper > 0.0) {
			return normalize(vec3(0.0, hit.y - CylinderCenter.y, hit.z - CylinderCenter.z));
		} else if (hit.x > CylinderCenter.x) {
			return vec3(1.0, 0.0, 0.0);
		} else return vec3(-1.0, 0.0, 0.0);
	} else if (CylinderDirection > 1.5) {
		if (helper > 0.0) {
			return normalize(vec3(hit.x - CylinderCenter.x, hit.y - CylinderCenter.y, 0.0));
		} else if (hit.z > CylinderCenter.z) {
			return vec3(0.0, 0.0, 1.0);
		} else return vec3(0.0, 0.0, -1.0);
	} else {
		if (helper > 0.0) {
			return normalize(vec3(hit.x - CylinderCenter.x, 0.0, hit.z - CylinderCenter.z));
		} else if (hit.y > CylinderCenter.y) {
			return vec3(0.0, 1.0, 0.0);
		} else return vec3(0.0, -1.0, 0.0);
	};
}
float random(vec3 scale, float seed) {
	return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
}
vec3 cosineWeightedDirection(float seed, vec3 normal) {
	float u = random(vec3(12.9898, 78.233, 151.7182), seed);
	float v = random(vec3(63.7264, 10.873, 623.6736), seed);
	float r = sqrt(u);
	float angle = 6.283185307179586 * v;
	vec3 sdir, tdir;
	if (abs(normal.x) < .5) {
		sdir = cross(normal, vec3(1, 0, 0));
	} else {
		sdir = cross(normal, vec3(0, 1, 0));
	}
	tdir = cross(normal, sdir);
	return r * cos(angle) * sdir + r * sin(angle) * tdir + sqrt(1. - u) * normal;
}
vec3 uniformlyRandomDirection(float seed) {
	float u = random(vec3(12.9898, 78.233, 151.7182), seed);
	float v = random(vec3(63.7264, 10.873, 623.6736), seed);
	float z = 1.0 - 2.0 * u;
	float r = sqrt(1.0 - z * z);
	float angle = 6.283185307179586 * v;
	return vec3(r * cos(angle), r * sin(angle), z);
}
vec3 uniformlyRandomVector(float seed) {
	return uniformlyRandomDirection(seed) * sqrt(random(vec3(36.7539, 50.3658, 306.2759), seed));
}
float shadow(vec3 origin, vec3 ray) {
	float t = 0.0;
	int hitID = -1;
	float helper = 0.0;
	if (intersectSphere(origin, ray, sphereCenter0, sphereRadius0, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter1, sphereRadius1, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter2, sphereRadius2, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter3, sphereRadius3, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter4, sphereRadius4, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter5, sphereRadius5, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter6, sphereRadius6, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter7, sphereRadius7, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter8, sphereRadius8, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter9, sphereRadius9, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter10, sphereRadius10, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter11, sphereRadius11, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter12, sphereRadius12, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter13, sphereRadius13, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter14, sphereRadius14, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter15, sphereRadius15, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter16, sphereRadius16, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter17, sphereRadius17, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter18, sphereRadius18, 0, t, hitID) < 1.0) return 0.0;
	if (intersectSphere(origin, ray, sphereCenter19, sphereRadius19, 0, t, hitID) < 1.0) return 0.0;
	return 1.0;
}
vec3 calculateColor(vec3 origin, vec3 ray, vec3 light) {
	vec3 colorMask = vec3(1.0);
	vec3 accumulatedColor = vec3(0.0);
	for (int bounce = 0; bounce < 4; bounce++) {
		float t = 0.0;
		int hitID = -1;
		vec2 tRoom = intersectCube(origin, ray, roomCubeMin, roomCubeMax, 0, t, hitID);
		if (tRoom.x < tRoom.y) t = tRoom.y;
		float tSphere0 = intersectSphere(origin, ray, sphereCenter0, sphereRadius0, 0, t, hitID);
		float tSphere1 = intersectSphere(origin, ray, sphereCenter1, sphereRadius1, 1, t, hitID);
		float tSphere2 = intersectSphere(origin, ray, sphereCenter2, sphereRadius2, 2, t, hitID);
		float tSphere3 = intersectSphere(origin, ray, sphereCenter3, sphereRadius3, 3, t, hitID);
		float tSphere4 = intersectSphere(origin, ray, sphereCenter4, sphereRadius4, 4, t, hitID);
		float tSphere5 = intersectSphere(origin, ray, sphereCenter5, sphereRadius5, 5, t, hitID);
		float tSphere6 = intersectSphere(origin, ray, sphereCenter6, sphereRadius6, 6, t, hitID);
		float tSphere7 = intersectSphere(origin, ray, sphereCenter7, sphereRadius7, 7, t, hitID);
		float tSphere8 = intersectSphere(origin, ray, sphereCenter8, sphereRadius8, 8, t, hitID);
		float tSphere9 = intersectSphere(origin, ray, sphereCenter9, sphereRadius9, 9, t, hitID);
		float tSphere10 = intersectSphere(origin, ray, sphereCenter10, sphereRadius10, 10, t, hitID);
		float tSphere11 = intersectSphere(origin, ray, sphereCenter11, sphereRadius11, 11, t, hitID);
		float tSphere12 = intersectSphere(origin, ray, sphereCenter12, sphereRadius12, 12, t, hitID);
		float tSphere13 = intersectSphere(origin, ray, sphereCenter13, sphereRadius13, 13, t, hitID);
		float tSphere14 = intersectSphere(origin, ray, sphereCenter14, sphereRadius14, 14, t, hitID);
		float tSphere15 = intersectSphere(origin, ray, sphereCenter15, sphereRadius15, 15, t, hitID);
		float tSphere16 = intersectSphere(origin, ray, sphereCenter16, sphereRadius16, 16, t, hitID);
		float tSphere17 = intersectSphere(origin, ray, sphereCenter17, sphereRadius17, 17, t, hitID);
		float tSphere18 = intersectSphere(origin, ray, sphereCenter18, sphereRadius18, 18, t, hitID);
		float tSphere19 = intersectSphere(origin, ray, sphereCenter19, sphereRadius19, 19, t, hitID);
		float helper = 0.0;
		vec3 hit = origin + ray * t;
		vec3 surfaceColor = vec3(0.75);
		float specularHighlight = 0.0;
		vec3 normal;
		if (t == tRoom.y) {
			normal = -normalForCube(hit, roomCubeMin, roomCubeMax);
			if (hit.x < -15.99999) surfaceColor = vec3(0.1, 0.5, 1.0);
			else if (hit.x > 15.99999) surfaceColor = vec3(1.0, 0.9, 0.1);
			ray = cosineWeightedDirection(timeSinceStart + float(bounce), normal);
		} else if (t == 10000.0) {
			break;
		} else {
			if (false);
			else if (hitID == 0) normal = normalForSphere(hit, sphereCenter0, sphereRadius0);
			else if (hitID == 1) normal = normalForSphere(hit, sphereCenter1, sphereRadius1);
			else if (hitID == 2) normal = normalForSphere(hit, sphereCenter2, sphereRadius2);
			else if (hitID == 3) normal = normalForSphere(hit, sphereCenter3, sphereRadius3);
			else if (hitID == 4) normal = normalForSphere(hit, sphereCenter4, sphereRadius4);
			else if (hitID == 5) normal = normalForSphere(hit, sphereCenter5, sphereRadius5);
			else if (hitID == 6) normal = normalForSphere(hit, sphereCenter6, sphereRadius6);
			else if (hitID == 7) normal = normalForSphere(hit, sphereCenter7, sphereRadius7);
			else if (hitID == 8) normal = normalForSphere(hit, sphereCenter8, sphereRadius8);
			else if (hitID == 9) normal = normalForSphere(hit, sphereCenter9, sphereRadius9);
			else if (hitID == 10) normal = normalForSphere(hit, sphereCenter10, sphereRadius10);
			else if (hitID == 11) normal = normalForSphere(hit, sphereCenter11, sphereRadius11);
			else if (hitID == 12) normal = normalForSphere(hit, sphereCenter12, sphereRadius12);
			else if (hitID == 13) normal = normalForSphere(hit, sphereCenter13, sphereRadius13);
			else if (hitID == 14) normal = normalForSphere(hit, sphereCenter14, sphereRadius14);
			else if (hitID == 15) normal = normalForSphere(hit, sphereCenter15, sphereRadius15);
			else if (hitID == 16) normal = normalForSphere(hit, sphereCenter16, sphereRadius16);
			else if (hitID == 17) normal = normalForSphere(hit, sphereCenter17, sphereRadius17);
			else if (hitID == 18) normal = normalForSphere(hit, sphereCenter18, sphereRadius18);
			else if (hitID == 19) normal = normalForSphere(hit, sphereCenter19, sphereRadius19);
			ray = cosineWeightedDirection(timeSinceStart + float(bounce), normal);
		}
		vec3 toLight = light - hit;
		float diffuse = max(0.0, dot(normalize(toLight), normal));
		vec3 toLightEps = light - (hit + (normal * 0.0001));
		float shadowIntensity = shadow(hit + normal * 0.0001, toLightEps);
		colorMask *= surfaceColor;
		accumulatedColor += colorMask * (1.8 * diffuse * shadowIntensity);
		accumulatedColor += colorMask * specularHighlight * shadowIntensity;
		origin = hit;
	}
	return accumulatedColor * 0.25;
}
void main() {
	vec3 newLight = light + uniformlyRandomVector(timeSinceStart - 53.0) * 0.1;
	vec2 xy = gl_FragCoord.xy;
	xy.x = xy.x / 147.00;
	xy.y = xy.y / 747.00;
	vec3 texture = texture2D(textureA, xy).rgb;
	gl_FragColor = vec4(mix(calculateColor(eye, initialRay, newLight), texture, textureWeight), 1.0);
}