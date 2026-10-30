// "What if you played basketball on the Moon?" — deterministic 3D scene.
// window.renderAt(t) draws the frame at time t (seconds); render.js captures each frame.
// Every motion uses real kinematics with g = 1.62 m/s² (Moon) or 9.81 m/s² (Earth).
import * as THREE from 'three';

const W = 1080, H = 1920;
const G_MOON = 1.62, G_EARTH = 9.81;
const BALL_R = 0.12;
const RIM = new THREE.Vector3(0, 3.05, 0);

// Stage boundaries, taken from the voiceover word timestamps (audio/words.json).
const T = { s1: 4.4, s2: 18.3, s3: 27.9, s4: 42.1, s5: 50.3, s6: 57.6, end: 68.6 };
window.DURATION = T.end;

// ---------- helpers ----------
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Value noise for terrain.
const R0 = rng(7); const PERM = new Float32Array(1024); for (let i = 0; i < 1024; i++) PERM[i] = R0();
function hash2(x, z) { return PERM[((x * 73856093) ^ (z * 19349663)) & 1023]; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), w);
}
function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s; }

const CRATERS = [];
{ const r = rng(11); for (let i = 0; i < 70; i++) {
  const ang = r() * Math.PI * 2, d = 22 + r() * 220;
  CRATERS.push({ x: Math.cos(ang) * d, z: Math.sin(ang) * d - 10, r: 1.5 + Math.pow(r(), 2) * 16 });
} }
// Flat play area: a corridor along the court axis so every ball lands on y = 0.
function flatMask(x, z) {
  const cz = clamp(z, -32, 13);
  const d = Math.hypot(x, z - cz);
  return 1 - smooth(9, 30, d);
}
function terrainH(x, z) {
  let h = (fbm(x * 0.03, z * 0.03) - 0.5) * 9 + (fbm(x * 0.3, z * 0.3) - 0.5) * 0.5;
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1.6) h += d < 1 ? -c.r * 0.22 * (1 - d * d) + c.r * 0.06 : c.r * 0.06 * Math.max(0, 1 - (d - 1) / 0.6);
  }
  const m = flatMask(x, z);
  return lerp(h, (fbm(x * 0.5, z * 0.5) - 0.5) * 0.04, m);
}

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // no atmosphere: black sky even in daylight
const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 2000);

const SUN_DIR = v3(0.9, 0.24, 0.38).normalize(); // low morning sun → long shadows
const sun = new THREE.DirectionalLight(0xfff6ea, 4.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
function aimSun(cx, cz) { sun.target.position.set(cx, 0, cz); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 90); }
aimSun(0, -6);
scene.add(new THREE.HemisphereLight(0x1a2233, 0x6b6b66, 0.35)); // regolith bounce + earthshine

// Ground
function noiseTexture(size, base, spread, seed) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const img = g.createImageData(size, size); const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    const v = base + (r() - 0.5) * spread + (vnoise(x * 0.08, y * 0.08) - 0.5) * spread * 1.4;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = clamp(v, 0, 255); img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
{
  const geo = new THREE.PlaneGeometry(700, 700, 360, 360); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, terrainH(x, z));
    const k = 0.55 + (fbm(x * 0.05 + 30, z * 0.05) - 0.5) * 0.35;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const map = noiseTexture(512, 150, 70, 3); map.repeat.set(160, 160);
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xa8a6a2, map, vertexColors: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true; scene.add(ground);
}
// Rocks
{
  const r = rng(21); const mat = new THREE.MeshStandardMaterial({ color: 0x8d8b87, roughness: 1, flatShading: true });
  for (let i = 0; i < 260; i++) {
    const ang = r() * Math.PI * 2, d = 6 + r() * 90;
    const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
    if (flatMask(x, z) > 0.6 && Math.abs(x) < 6) continue;
    const s = 0.05 + Math.pow(r(), 3) * 0.9;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
    m.position.set(x, terrainH(x, z) + s * 0.3, z); m.rotation.set(r() * 6, r() * 6, r() * 6); m.scale.y = 0.6;
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
}
// Earth: true angular size (~1.9°) at 450 m distance
const EARTH_DIR = v3(-0.22, 0.30, -1).normalize();
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#123e8a'; g.fillRect(0, 0, 1024, 512);
  const r = rng(5);
  for (let i = 0; i < 1024; i += 2) for (let j = 0; j < 512; j += 2) {
    const n = fbm(i * 0.006, j * 0.012);
    if (n > 0.56) { g.fillStyle = n > 0.66 ? '#8a7a52' : '#3d6b35'; g.fillRect(i, j, 2, 2); }
    const cl = fbm(i * 0.012 + 50, j * 0.03 + 9);
    if (cl > 0.58) { g.fillStyle = `rgba(255,255,255,${clamp((cl - 0.58) * 6, 0, 0.95)})`; g.fillRect(i, j, 2, 2); }
  }
  g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, 1024, 26); g.fillRect(0, 490, 1024, 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(7.5, 64, 32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  earth.position.copy(EARTH_DIR).multiplyScalar(450); earth.rotation.set(0.4, 2.2, 0.1);
  scene.add(earth);
}

// Hoop (NBA dimensions: rim 3.05 m, rim Ø 0.457 m, board 1.83 × 1.07 m, rim centre 0.38 m from board)
const hoop = new THREE.Group(); scene.add(hoop);
{
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe0571c, roughness: 0.4, metalness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 24), steel); pole.position.set(0, 1.8, -1.6);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.25), steel); arm.position.set(0, 3.45, -1.0);
  const c = document.createElement('canvas'); c.width = 512; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 512, 300); g.strokeStyle = '#e0571c'; g.lineWidth = 14;
  g.strokeRect(10, 10, 492, 280); g.lineWidth = 10; g.strokeRect(165, 130, 182, 130);
  const bt = new THREE.CanvasTexture(c); bt.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.07, 0.05),
    [white, white, white, white, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.4 }), white]);
  board.position.set(0, 3.435, -0.405);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2286, 0.011, 12, 48), orange); rim.rotation.x = Math.PI / 2; rim.position.copy(RIM);
  const brk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.16), orange); brk.position.set(0, 3.05, -0.3);
  for (const m of [pole, arm, board, rim, brk]) { m.castShadow = m.receiveShadow = true; hoop.add(m); }
}
// Net (rest shape; a passing ball pushes it out a little)
const NET_N = 12, NET_ROWS = 5, NET_LEN = 0.42;
const netGeo = new THREE.BufferGeometry();
const netPos = new Float32Array(NET_N * NET_ROWS * 2 * 3 * 2);
netGeo.setAttribute('position', new THREE.BufferAttribute(netPos, 3));
const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0xffffff })); scene.add(net);
function netPoint(i, row, bulge) {
  const k = row / (NET_ROWS - 1); const a = (i / NET_N) * Math.PI * 2 + (row % 2) * (Math.PI / NET_N);
  const r = lerp(0.2286, 0.13, k) + bulge * Math.sin(k * Math.PI) * 0.06;
  return [RIM.x + Math.cos(a) * r, RIM.y - k * NET_LEN, RIM.z + Math.sin(a) * r];
}
function updateNet(bulge) {
  let o = 0; const push = (p) => { netPos[o++] = p[0]; netPos[o++] = p[1]; netPos[o++] = p[2]; };
  for (let row = 0; row < NET_ROWS - 1; row++) for (let i = 0; i < NET_N; i++) {
    push(netPoint(i, row, bulge)); push(netPoint(i, row + 1, bulge));
    push(netPoint(i, row, bulge)); push(netPoint((i + 1) % NET_N, row + 1, bulge));
  }
  netGeo.attributes.position.needsUpdate = true; netGeo.computeBoundingSphere();
}

// Basketball
function ballTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#d4642a'; g.fillRect(0, 0, 1024, 512);
  const r = rng(9); for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(r() * 1024, r() * 512, 2, 2); }
  g.strokeStyle = '#1b0f08'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(0, 256); g.lineTo(1024, 256); g.stroke();
  for (const x of [0, 512, 1024]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  for (const cx of [256, 768]) { g.beginPath(); for (let y = 0; y <= 512; y += 4) { const x = cx + Math.sin((y / 512) * Math.PI) * 150 * (cx === 256 ? 1 : -1); y ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ballMat = new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.75 });
function makeBall() { const b = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 48, 24), ballMat); b.castShadow = true; scene.add(b); return b; }
const ball = makeBall(), ball2 = makeBall(), ballE = makeBall();

// Planks for the drop comparison
const planks = new THREE.Group(); scene.add(planks);
{
  const wood = new THREE.MeshStandardMaterial({ color: 0xb8854a, roughness: 0.55 });
  for (const x of [-0.45, 0.45]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), wood); p.position.set(x, 0.02, 8); p.receiveShadow = p.castShadow = true; planks.add(p); }
}

// Distance marker for the 29 m shot
const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.9 }));
marker.rotation.x = -Math.PI / 2; scene.add(marker);
const landRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true }));
landRing.rotation.x = -Math.PI / 2; scene.add(landRing);

// Astronaut built from primitives. Origin at feet; faces local +z.
const suitMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 });
const greyMat = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.8 });
const cubeRT = new THREE.WebGLCubeRenderTarget(256); const cubeCam = new THREE.CubeCamera(0.1, 1000, cubeRT); scene.add(cubeCam);
const visorMat = new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 1, roughness: 0.08, envMap: cubeRT.texture, envMapIntensity: 1.4 });
function capsule(r, len, mat) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat); m.castShadow = true; return m; }
const astro = new THREE.Group(); scene.add(astro);
const body = new THREE.Group(); astro.add(body);
const legs = [];
for (const s of [-1, 1]) {
  const hip = new THREE.Group(); hip.position.set(0.13 * s, 0.86, 0); body.add(hip);
  const thigh = capsule(0.11, 0.3, suitMat); thigh.position.y = -0.2; hip.add(thigh);
  const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
  const shin = capsule(0.1, 0.28, suitMat); shin.position.y = -0.2; knee.add(shin);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), greyMat); boot.position.set(0, -0.38, 0.04); boot.castShadow = true; knee.add(boot);
  legs.push({ hip, knee });
}
const torso = capsule(0.26, 0.42, suitMat); torso.position.y = 1.25; body.add(torso);
const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.26), suitMat); pack.position.set(0, 1.3, -0.32); pack.castShadow = true; body.add(pack);
const panel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.08), greyMat); panel.position.set(0, 1.18, 0.26); body.add(panel);
const head = new THREE.Group(); head.position.y = 1.72; body.add(head);
const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 32, 24), suitMat); helmet.castShadow = true; head.add(helmet);
const visor = new THREE.Mesh(new THREE.SphereGeometry(0.214, 48, 24, Math.PI / 2 - 0.95, 1.9, 0.75, 1.15), visorMat); head.add(visor);
const arms = [];
for (const s of [-1, 1]) {
  const sh = new THREE.Group(); sh.position.set(0.34 * s, 1.47, 0); body.add(sh);
  const up = capsule(0.085, 0.24, suitMat); up.position.y = -0.17; sh.add(up);
  const el = new THREE.Group(); el.position.y = -0.34; sh.add(el);
  const fo = capsule(0.078, 0.22, suitMat); fo.position.y = -0.15; el.add(fo);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), greyMat); glove.position.y = -0.32; el.add(glove);
  arms.push({ sh, el, glove });
}
// pose: crouch 0..1, arm angles (rad, forward raise), elbow bend
function pose({ crouch = 0, armL = 0.15, armR = 0.15, elbowL = 0.3, elbowR = 0.3, spreadL = 0.12, spreadR = 0.12 }) {
  for (const l of legs) { l.hip.rotation.x = -crouch * 0.9; l.knee.rotation.x = crouch * 1.6; }
  body.position.y = -crouch * 0.22;
  arms[0].sh.rotation.set(-armL, 0, -spreadL); arms[0].el.rotation.x = -elbowL;
  arms[1].sh.rotation.set(-armR, 0, spreadR); arms[1].el.rotation.x = -elbowR;
}
function placeAstro(x, y, z, facing = Math.PI) { astro.position.set(x, y, z); astro.rotation.y = facing; }
function handWorld(i) { astro.updateMatrixWorld(true); return arms[i].glove.getWorldPosition(new THREE.Vector3()); }

// Dust: each grain flies on a ballistic arc (no air → no drifting cloud) and stops on the ground.
const bursts = [];
function addBurst(t0, x, z, n, speed, seed, y0 = 0) {
  const r = rng(seed); const vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, s = speed * (0.25 + r() * 0.75);
    vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = speed * (0.3 + r() * 1.1); vel[i * 3 + 2] = Math.sin(a) * s;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9a978f, size: 0.011, sizeAttenuation: true }));
  pts.frustumCulled = false; scene.add(pts);
  bursts.push({ t0, x, z, y0, n, vel, pts });
}
function updateBursts(t) {
  for (const b of bursts) {
    const dt = t - b.t0; b.pts.visible = dt > 0 && dt < 12;
    if (!b.pts.visible) continue;
    const p = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < b.n; i++) {
      const vx = b.vel[i * 3], vy = b.vel[i * 3 + 1], vz = b.vel[i * 3 + 2];
      const tl = (vy + Math.sqrt(vy * vy + 2 * G_MOON * b.y0)) / G_MOON; const tt = Math.min(dt, tl);
      p[i * 3] = b.x + vx * tt; p[i * 3 + 1] = Math.max(0.005, b.y0 + vy * tt - 0.5 * G_MOON * tt * tt); p[i * 3 + 2] = b.z + vz * tt;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
  }
}

// Drop-and-bounce from rest: height of the ball's bottom above the floor.
function bounceY(t, h0, g, e) {
  if (t <= 0) return h0;
  let t1 = Math.sqrt(2 * h0 / g);
  if (t < t1) return h0 - 0.5 * g * t * t;
  let v = g * t1 * e, tc = t1;
  for (let k = 0; k < 20 && v > 0.02; k++) {
    const dur = 2 * v / g; if (t < tc + dur) { const u = t - tc; return v * u - 0.5 * g * u * u; }
    tc += dur; v *= e;
  }
  return 0;
}
function impacts(h0, g, e, n) { const out = []; let tc = Math.sqrt(2 * h0 / g), v = g * tc * e; out.push(tc); for (let k = 1; k < n; k++) { tc += 2 * v / g; v *= e; out.push(tc); } return out; }

// ---------- timeline events (absolute seconds) ----------
// Stage 2: synchronized drop from 1 m, Earth vs Moon (both on hard planks).
const DROP_T = 20.5, DROP_H = 1.0;
const T_EARTH_LAND = DROP_T + Math.sqrt(2 * DROP_H / G_EARTH);   // +0.45 s
const T_MOON_LAND = DROP_T + Math.sqrt(2 * DROP_H / G_MOON);     // +1.11 s
// Stage 2b: Moon ball onto loose dust (restitution ~0.15, energy absorbed by regolith).
const DUST_T = 25.0, DUST_POS = v3(3.2, 0, 9.5), DUST_E = 0.15;
const dustHits = impacts(DROP_H, G_MOON, DUST_E, 2);
addBurst(DUST_T + dustHits[0], DUST_POS.x, DUST_POS.z, 900, 1.3, 31);
addBurst(DUST_T + dustHits[1], DUST_POS.x, DUST_POS.z, 250, 0.4, 32);

// Stage 3 shot 1: 7 m/s at 52°, normal free-throw release, on the Moon.
const SHOOTER = v3(0, 0, 4.2), REL = v3(0, 2.1, 3.95);
const S1_T = 29.0, S1_V = 6.8, S1_A = 52 * Math.PI / 180;
const s1v = v3(0, S1_V * Math.sin(S1_A), -S1_V * Math.cos(S1_A));
const S1_FLIGHT = (s1v.y + Math.sqrt(s1v.y ** 2 + 2 * G_MOON * (REL.y - BALL_R))) / G_MOON;
const S1_LAND_Z = REL.z + s1v.z * S1_FLIGHT;
addBurst(S1_T + S1_FLIGHT, 0, S1_LAND_Z, 700, 1.6, 41);
// Shot 2: the "gentle toss" that actually goes in. Solve speed for a 55° release to the rim centre.
const S2_T = 36.9, S2_A = 55 * Math.PI / 180, dxy = REL.z - RIM.z, dyy = RIM.y - REL.y;
const S2_V = Math.sqrt(G_MOON * dxy * dxy / (2 * Math.cos(S2_A) ** 2 * (dxy * Math.tan(S2_A) - dyy)));
const s2v = v3(0, S2_V * Math.sin(S2_A), -S2_V * Math.cos(S2_A));
const S2_RIM_T = dxy / (S2_V * Math.cos(S2_A));
console.log('shot1 flight', S1_FLIGHT.toFixed(2), 'range', (REL.z - S1_LAND_Z).toFixed(1), 'toss v', S2_V.toFixed(2), 'toss t', S2_RIM_T.toFixed(2));

// Stage 4 jump: suited estimate, takeoff 3.29 m/s → 3.3 m rise, 4.06 s hang.
const J_V = 3.29, J_T = 43.8, J_HANG = 2 * J_V / G_MOON, J_POS = v3(1.3, 0, 1.4);
addBurst(J_T, J_POS.x, J_POS.z, 400, 0.9, 51);
addBurst(J_T + J_HANG, J_POS.x, J_POS.z, 500, 1.1, 52);

// Stage 5 dunk attempt: smaller jump toward the rim, then slow-motion from the apex.
const D_T = 52.25, D_V = 2.25, D_POS = v3(0, 0, 1.5), D_VZ = -0.5;
const D_APEX = D_V / G_MOON;
addBurst(D_T, D_POS.x, D_POS.z, 400, 0.9, 61);

// ---------- captions from voiceover timing ----------
const WORD_MAP = { 'eight': '8', 'P-S-I': 'PSI', 'twenty-nine': '29', 'eighty-kilo': '80-KILO', 'fifteen': '15', 'four': '4', 'three': '3' };
const HOT = new Set(['8', 'PSI', '3', 'BURST', 'SLOW', 'MOTION', 'HALF', 'DUST', '29', 'METERS', 'NBA', 'COURT', 'SILENCE', 'TOSS', 'SWISH', '4', 'SECONDS', '80-KILO', 'DUNK', 'EASILY', 'SUIT', '15', 'ALIVE', 'MOON', 'NO', 'AIR', 'SWELLS']);
let captions = [];
async function loadCaptions() {
  const words = (await (await fetch('./audio/words.json')).json()).words.filter(w => w.type === 'word');
  let cur = null, skipNext = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; const raw = w.text;
    if (/^stage$/i.test(raw)) { skipNext = true; continue; }            // stage card shows it instead
    if (skipNext) { skipNext = false; if (cur) { captions.push(cur); cur = null; } continue; }
    let txt = raw.replace(/[.?!,]+$|\.\.\.$/g, '');
    const punct = /[.?!,]|\.\.\.$/.test(raw.slice(-1)) || raw.endsWith('...');
    txt = (WORD_MAP[txt] || txt).toUpperCase();
    if (!cur) cur = { t0: w.start, t1: w.end, words: [] };
    cur.words.push({ txt, t: w.start, end: raw.endsWith('?') ? '?' : '' }); cur.t1 = w.end;
    if (punct || cur.words.length >= 3) { captions.push(cur); cur = null; }
  }
  if (cur) captions.push(cur);
}
const capEl = document.getElementById('cap');
function updateCaption(t) {
  let c = null; for (let i = 0; i < captions.length; i++) {
    const nx = captions[i + 1]; const end = nx ? Math.min(nx.t0, captions[i].t1 + 0.6) : captions[i].t1 + 0.8;
    if (t >= captions[i].t0 - 0.05 && t < end) { c = captions[i]; break; }
  }
  capEl.innerHTML = c ? c.words.map(w => {
    const on = t >= w.t - 0.05; const hot = HOT.has(w.txt.replace(/[^A-Z0-9-]/g, ''));
    const s = w.txt + w.end; return `<span style="opacity:${on ? 1 : 0.35}">${hot ? `<b>${s}</b>` : s}</span>`;
  }).join(' ') : '';
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const STAGES = [[T.s1, '1', 'THE BALL'], [T.s2, '2', 'THE DRIBBLE'], [T.s3, '3', 'THE SHOT'], [T.s4, '4', 'THE JUMP'], [T.s5, '5', 'THE DUNK'], [T.s6, '6', 'THE HELMET']];
function fadeWin(t, a, b, f = 0.25) { return Math.min(smooth(a, a + f, t), 1 - smooth(b - f, b, t)); }
function chip(t, list) { // list: [t0, t1, html]
  const el = $('chip'); const it = list.find(([a, b]) => t >= a && t < b);
  el.style.opacity = it ? fadeWin(t, it[0], it[1]) : 0; if (it) el.innerHTML = it[2];
}
const CHIPS = [
  [7.9, 11.6, '+8 PSI<small>INSIDE vs. OUTSIDE AIR (EARTH)</small>'],
  [11.6, 13.8, 'OUTSIDE: 0 PSI<small>NO AIR ON THE MOON</small>'],
  [13.8, 18.2, '8 → ~22 PSI<small>PRESSURE DIFFERENCE · 2.8×</small>'],
  [31.3, 36.3, '≈ 29 m<small>NBA COURT = 28.7 m</small>'],
  [37.0, 39.4, 'NEEDED: ~2.9 m/s<small>INSTEAD OF ~7 m/s ON EARTH</small>'],
  [48.0, 50.2, 'EARTH 0.76 s · MOON ~4 s<small>SAME LEGS · 80 kg SUIT · ESTIMATE</small>'],
  [60.2, 63.6, '~15 SECONDS<small>OF USEFUL CONSCIOUSNESS IN A VACUUM</small>'],
];
function updateUI(t) {
  $('title').style.opacity = fadeWin(t, 0.0, 4.3, 0.35);
  const st = [...STAGES].reverse().find(s => t >= s[0]);
  const sEl = $('stage');
  if (st) { sEl.style.opacity = fadeWin(t, st[0], st[0] + 2.6, 0.2); $('snum').textContent = `STAGE ${st[1]} / 6`; $('sname').textContent = st[2]; } else sEl.style.opacity = 0;
  chip(t, CHIPS);
  // Drop comparison labels
  const lo = fadeWin(t, 20.2, 24.6);
  $('lblL').style.opacity = lo; $('lblR').style.opacity = lo;
  $('lblL').innerHTML = 'EARTH' + (t >= T_EARTH_LAND ? '<br><span style="color:#ffd23f">0.45 s</span>' : '');
  $('lblR').innerHTML = 'MOON' + (t >= T_MOON_LAND ? '<br><span style="color:#ffd23f">1.11 s</span>' : '');
  // Hang-time counter
  const cEl = $('counter');
  if (t >= J_T - 0.2 && t < J_T + J_HANG + 1.6) {
    const v = clamp(t - J_T, 0, J_HANG); cEl.style.opacity = 1;
    cEl.innerHTML = v.toFixed(1) + 's<small>IN THE AIR</small>';
  } else cEl.style.opacity = 0;
  $('mute').style.opacity = fadeWin(t, S2_T + S2_RIM_T - 0.2, T.s4 - 0.1);
  $('mute').innerHTML = t > D_T + D_APEX && t < T.s6 ? 'SLOW MOTION' : 'NO AIR · NO SOUND';
  if (t > D_T + D_APEX && t < T.s6) $('mute').style.opacity = fadeWin(t, D_T + D_APEX, T.s6 - 0.3);
  $('black').style.opacity = smooth(T.s6 - 0.45, T.s6 - 0.15, t) * (t < T.s6 ? 1 : 0) + (t >= T.s6 ? 1 - smooth(T.s6, T.s6 + 0.5, t) : 0);
}

// ---------- per-frame scene state ----------
function look(px, py, pz, tx, ty, tz, fov = 50) { camera.position.set(px, py, pz); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(tx, ty, tz); }
const HIDE = v3(0, -50, 0);
const HOME = v3(1.4, 0, 5.2);
function heldBall(spread = 0) { const a = handWorld(0), b = handWorld(1); return a.add(b).multiplyScalar(0.5).add(v3(0, 0.02, 0)).addScaledVector(v3(0, 0, -1), 0.12 + spread); }

function frame(t) {
  ball.scale.setScalar(1); ball2.position.copy(HIDE); ballE.position.copy(HIDE);
  planks.visible = false; marker.visible = false; landRing.visible = false; updateNet(0);
  pose({}); placeAstro(HOME.x, 0, HOME.z);

  if (t < T.s1) { // HOOK — descend from orbit-like height to the lone hoop
    pose({ armL: 0.5, armR: 0.5, elbowL: 1.2, elbowR: 1.2, spreadL: -0.05, spreadR: -0.05 });
    ball.position.copy(heldBall());
    const k = ease(clamp(t / 4.2, 0, 1));
    look(lerp(-6, 5.5, k), lerp(70, 2.0, k), lerp(55, 12.5, k), 0, lerp(0, 2.4, k), lerp(-10, 0, k), 50);
  } else if (t < T.s2) { // STAGE 1 — the ball swells in vacuum
    pose({ armL: 0.9, armR: 0.9, elbowL: 1.0, elbowR: 1.0, spreadL: -0.08, spreadR: -0.08 });
    const FACE = Math.atan2(SUN_DIR.x, SUN_DIR.z) - 0.35; placeAstro(HOME.x, 0, HOME.z, FACE);
    const sw = smooth(13.4, 16.8, t); const wob = Math.sin(t * 9) * 0.004 * sw;
    ball.scale.setScalar(1 + 0.07 * sw + wob);
    const bp = heldBall(0.04); ball.position.copy(bp);
    const u = (t - T.s1) / (T.s2 - T.s1);
    const ang = lerp(-0.9, 0.4, u);
    const d = lerp(1.25, 0.8, ease(u)), a2 = FACE + ang;
    look(bp.x + Math.sin(a2) * d, bp.y + 0.15, bp.z + Math.cos(a2) * d, bp.x, bp.y + 0.02, bp.z, 40);
  } else if (t < T.s3) { // STAGE 2 — Earth vs Moon drop, then loose dust
    planks.visible = t < 24.7;
    if (t < 24.7) {
      const ye = bounceY(t - DROP_T, DROP_H, G_EARTH, 0.75), ym = bounceY(t - DROP_T, DROP_H, G_MOON, 0.75);
      ballE.position.set(-0.45, 0.04 + BALL_R + ye, 8); ball.position.set(0.45, 0.04 + BALL_R + ym, 8);
      look(0, 0.8, 12.6, 0, 0.62, 8, 38);
    } else {
      const y = bounceY(t - DUST_T, DROP_H, G_MOON, DUST_E);
      ball.position.set(DUST_POS.x, BALL_R + y - (t > DUST_T + dustHits[0] ? 0.025 : 0), DUST_POS.z); // sinks a bit into regolith
      const u = t - 24.7;
      look(DUST_POS.x + 1.5 - u * 0.05, 0.32 + u * 0.02, DUST_POS.z + 1.9, DUST_POS.x, 0.35, DUST_POS.z, 40);
    }
  } else if (t < T.s4) { // STAGE 3 — the 29 m free throw, then the gentle toss
    placeAstro(SHOOTER.x, 0, SHOOTER.z);
    const shoot = (tr) => { const up = smooth(tr - 0.6, tr - 0.1, t), fol = smooth(tr, tr + 0.25, t);
      pose({ crouch: 0.25 * (smooth(tr - 0.6, tr - 0.3, t) - smooth(tr - 0.25, tr, t)), armL: lerp(0.6, 2.7, up), armR: lerp(0.6, 2.9, up), elbowL: lerp(1.2, 0.6 - 0.4 * fol, up), elbowR: lerp(1.2, 0.6 - 0.5 * fol, up), spreadL: -0.1, spreadR: -0.1 }); };
    // ground marker shows the predicted landing point
    marker.visible = t > 31.3; marker.material.opacity = smooth(31.3, 31.8, t) * 0.85;
    const L = REL.z - S1_LAND_Z; marker.scale.y = L * smooth(31.3, 32.3, t); marker.position.set(0, 0.012, REL.z - marker.scale.y / 2);
    landRing.visible = t > 32.0; landRing.position.set(0, 0.013, S1_LAND_Z); landRing.material.opacity = smooth(32, 32.4, t);
    if (t < S2_T - 0.9) {
      shoot(S1_T);
      const dt = t - S1_T;
      if (dt < 0) ball.position.copy(heldBall());
      else { const tt = Math.min(dt, S1_FLIGHT); ball.position.copy(REL).addScaledVector(s1v, tt).add(v3(0, -0.5 * G_MOON * tt * tt, 0));
        if (dt > S1_FLIGHT) ball.position.y = BALL_R - 0.03; } // lands and sinks into the dust
      { // behind the shooter, then chase the ball all the way down
        const b = ball.position; const k = smooth(S1_T + 0.2, S1_T + 1.4, t);
        look(lerp(1.6, b.x + 3.8, k), lerp(2.6, b.y * 0.8 + 0.8, k), lerp(8.2, b.z + 3.0, k), lerp(0, b.x, k), lerp(2.6, b.y, k), lerp(0, b.z - 1.5, k), 55);
      }
      ball2.position.copy(HIDE);
    } else {
      shoot(S2_T);
      ball.position.copy(HIDE);
      const dt = t - S2_T;
      if (dt < 0) ball2.position.copy(heldBall());
      else if (dt < S2_RIM_T) ball2.position.copy(REL).addScaledVector(s2v, dt).add(v3(0, -0.5 * G_MOON * dt * dt, 0));
      else { // through the net: keeps its horizontal speed briefly, then falls; net slows it
        const u = dt - S2_RIM_T; const vy0 = s2v.y - G_MOON * S2_RIM_T;
        const y = RIM.y + vy0 * u - 0.5 * G_MOON * u * u; const z = RIM.z + s2v.z * 0.35 * Math.min(u, 0.6);
        ball2.position.set(0, Math.max(BALL_R, y), z);
      }
      const nb = smooth(S2_T + S2_RIM_T - 0.05, S2_T + S2_RIM_T + 0.25, t) * (1 - smooth(S2_T + S2_RIM_T + 0.4, S2_T + S2_RIM_T + 1.4, t));
      updateNet(nb);
      const k = smooth(S2_T + 0.4, S2_T + S2_RIM_T, t);
      look(lerp(3.6, 2.4, k), lerp(2.6, 3.2, k), lerp(7.0, 2.4, k), 0, lerp(2.6, 3.0, k), lerp(2.0, 0, k), 46);
    }
  } else if (t < T.s5) { // STAGE 4 — the 4-second hang time
    const dt = t - J_T; let y = 0, crouch = 0;
    if (dt < 0) crouch = smooth(J_T - 0.5, J_T - 0.1, t) * 0.9;
    else if (dt < J_HANG) { y = J_V * dt - 0.5 * G_MOON * dt * dt; crouch = 0.15 * Math.sin(Math.min(1, dt / J_HANG) * Math.PI); }
    else crouch = 0.6 * (1 - smooth(J_T + J_HANG, J_T + J_HANG + 0.8, t)) * smooth(J_T + J_HANG, J_T + J_HANG + 0.15, t);
    placeAstro(J_POS.x, y, J_POS.z, Math.PI);
    pose({ crouch, armL: dt > 0 && dt < J_HANG ? 1.2 : 0.3, armR: dt > 0 && dt < J_HANG ? 2.6 : 0.3, elbowL: 0.5, elbowR: 0.4, spreadL: 0.3, spreadR: 0.1 });
    ball.position.copy(handWorld(1)).add(v3(0, 0.1, -0.05));
    const ang = (t - T.s4) * 0.12 + 0.9;
    look(J_POS.x + Math.sin(ang) * 9.5, 1.9, J_POS.z + Math.cos(ang) * 9.5, 0.7, 3.1, 0.7, 58);
  } else if (t < T.s6) { // STAGE 5 — the dunk the suit won't allow
    const apexT = D_T + D_APEX;
    const st = t <= apexT ? t - D_T : D_APEX + (t - apexT) * 0.2; // 0.2× slow-mo after the apex
    let y = 0, z = D_POS.z, crouch = 0;
    if (st < 0) crouch = smooth(D_T - 0.5, D_T - 0.1, t) * 0.8;
    else { y = Math.max(0, D_V * st - 0.5 * G_MOON * st * st); z = D_POS.z + D_VZ * st; }
    placeAstro(0, y, z, Math.PI);
    // arm strains: rises slowly with jitter but stalls short of overhead
    const strain = smooth(54.4, 57.4, t);
    const armR = st < 0 ? 0.4 : lerp(1.0, 1.75, strain) + Math.sin(t * 31) * 0.025 * strain;
    pose({ crouch, armL: 0.5, armR, elbowL: 0.6, elbowR: 0.25, spreadL: 0.35, spreadR: 0.05 });
    ball.position.copy(handWorld(1)).add(v3(0, 0.1, -0.06));
    if (t < 53.3) look(4.4, 2.2, -1.0, 0, 2.4, 1.0, 50);
    else { const u = smooth(53.3, 57.5, t); look(lerp(3.0, 2.4, u), lerp(3.5, 3.4, u), lerp(-1.3, -1.2, u), 0, 3.1, 0.55, lerp(44, 36, u)); }
  } else { // STAGE 6 — visor close-up, then pull back to the opening shot (loop)
    pose({ armL: 0.5, armR: 0.5, elbowL: 1.2, elbowR: 1.2, spreadL: -0.05, spreadR: -0.05 });
    ball.position.copy(heldBall());
    astro.updateMatrixWorld(true);
    const hp = head.getWorldPosition(new THREE.Vector3());
    if (t < 62.6) { const u = ease(clamp((t - T.s6) / 5, 0, 1)); look(hp.x - 0.15 + u * 0.1, hp.y + 0.03, hp.z - lerp(1.0, 0.55, u), hp.x, hp.y, hp.z, 40); }
    else { const k = ease(clamp((t - 62.6) / (T.end - 62.6), 0, 1));
      look(lerp(5.5, -6, k), lerp(2.0, 70, k), lerp(12.5, 55, k), 0, lerp(2.4, 0, k), lerp(0, -10, k), 50); }
  }
  updateBursts(t);
  aimSun(camera.position.x * 0.3, Math.min(camera.position.z * 0.3, 4) - 6);
}

let cubeReady = false;
window.renderAt = async (t) => {
  frame(t);
  if (!cubeReady || (t >= T.s6 && !window._cube6)) { // visor reflection, captured from the head
    astro.updateMatrixWorld(true); visor.visible = false;
    cubeCam.position.copy(head.getWorldPosition(new THREE.Vector3())).add(v3(0, 0, -0.5));
    cubeCam.update(renderer, scene); visor.visible = true; cubeReady = true; if (t >= T.s6) window._cube6 = true;
  }
  updateUI(t); updateCaption(t);
  renderer.render(scene, camera);
};
await loadCaptions();
window.READY = true;
