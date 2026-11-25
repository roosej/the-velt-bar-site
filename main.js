import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
document.getElementById('yr').textContent = new Date().getFullYear();

/* ---------- renderer / scene ---------- */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
camera.position.set(0, 0.2, 10);
camera.lookAt(0, -0.4, 0);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 5, 4);
scene.add(key, new THREE.AmbientLight(0xffffff, 0.4));

const GRAV = 9;

/* ---------- liquid materials (colour driven by one shared proxy) ---------- */
const liquidColor = new THREE.Color('#e9742b');
const liquidMats = [];
function liquidMaterial(extra = {}, tint = 0) {
  const m = new THREE.MeshPhysicalMaterial({
    color: liquidColor, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.33,
    transparent: true, opacity: 0.86, depthWrite: false, envMapIntensity: 1.4, side: THREE.DoubleSide, ...extra,
  });
  m.userData.tint = tint;
  liquidMats.push(m);
  return m;
}
const tmpCol = new THREE.Color();
function syncLiquidColor() {
  liquidMats.forEach((m) => {
    m.color.copy(liquidColor);
    if (m.userData.tint) m.color.lerp(tmpCol.set(0xffffff), m.userData.tint);
  });
}

/* ---------- glass (martini) ---------- */
const glass = new THREE.Group();
scene.add(glass);

const outer = [[0.001,0],[0.85,0],[0.9,0.03],[0.85,0.07],[0.1,0.13],[0.055,0.25],[0.045,1.45],[0.05,1.55],
  [0.4,1.9],[0.8,2.3],[1.15,2.75]].map(([x, y]) => new THREE.Vector2(x, y));
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xd5dde1, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.3, depthWrite: false,
  envMapIntensity: 2.6, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide,
});
const glassMesh = new THREE.Mesh(new THREE.LatheGeometry(outer, 96), glassMat);
glassMesh.renderOrder = 8; // drawn last so reflections sit over the liquid
glass.add(glassMesh);

const LIQ_MIN = 1.6, LIQ_MAX = 2.45, slope = 0.93;
const liquidMat = liquidMaterial({ opacity: 0.88, clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)] });
const liqProfile = [[0.001, LIQ_MIN], [1.06, 2.74]].map(([x, y]) => new THREE.Vector2(x, y));
const liquid = new THREE.Mesh(new THREE.LatheGeometry(liqProfile, 64), liquidMat);
liquid.renderOrder = 1;
const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 64), liquidMaterial({ opacity: 0.95 }, 0.12));
surface.rotation.x = -Math.PI / 2;
surface.renderOrder = 2;
glass.add(liquid, surface);

// contact shadow
const sc = document.createElement('canvas'); sc.width = sc.height = 128;
const sx = sc.getContext('2d'); const g = sx.createRadialGradient(64, 64, 4, 64, 64, 64);
g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
sx.fillStyle = g; sx.fillRect(0, 0, 128, 128);
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4),
  new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; shadow.renderOrder = -1;
glass.add(shadow);

/* ---------- shaker ---------- */
const shaker = new THREE.Group();
scene.add(shaker);
const sp = [[0.001,0],[0.42,0],[0.5,0.08],[0.6,0.9],[0.62,1.15],[0.56,1.2],[0.56,1.3],[0.6,1.34],[0.6,1.5],
  [0.52,1.62],[0.32,1.8],[0.2,1.9],[0.2,2.1],[0.17,2.15],[0.001,2.15]].map(([x, y]) => new THREE.Vector2(x, y));
const shakerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 1, roughness: 0.22, envMapIntensity: 1.3, side: THREE.DoubleSide });
const shakerMesh = new THREE.Mesh(new THREE.LatheGeometry(sp, 96), shakerMat);
shakerMesh.position.y = -1.075; // centre pivot
shaker.add(shakerMesh);
shaker.scale.setScalar(0.85);
const LIP = new THREE.Vector3(-0.17, 1.075, 0); // lower lip of the mouth, shaker-local

/* ---------- ballistic pour stream (tube rebuilt each frame) ---------- */
const TN = 56, TM = 14;
function makeTube(mat, radiusScale, order) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((TN + 1) * TM * 3), 3));
  const idx = [];
  for (let i = 0; i < TN; i++) for (let j = 0; j < TM; j++) {
    const a = i * TM + j, b = i * TM + (j + 1) % TM, c = (i + 1) * TM + j, d = (i + 1) * TM + (j + 1) % TM;
    idx.push(a, c, b, b, c, d);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = order;
  scene.add(mesh);
  return { geo, mesh, radiusScale };
}
const tubes = [
  makeTube(liquidMaterial({ opacity: 0.8 }), 1, 3),
  makeTube(liquidMaterial({ opacity: 0.55, roughness: 0.02 }, 0.4), 0.45, 4), // bright translucent core
];
const lipW = new THREE.Vector3(), impact = new THREE.Vector3();

function updateStream(t, head, tail, flow) {
  const on = head > 0.001 && tail < 0.999 && flow > 0.01;
  tubes.forEach((tb) => (tb.mesh.visible = on));
  if (!on) return;
  const vy0 = 0.4;
  const H = Math.max(lipW.y - impact.y, 0.05);
  const T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * GRAV * H)) / GRAV;
  const vx = (impact.x - lipW.x) / T;
  const speed0 = Math.hypot(vx, vy0);
  tubes.forEach((tb) => {
    const pos = tb.geo.attributes.position.array;
    for (let i = 0; i <= TN; i++) {
      const s = tail + (head - tail) * (i / TN);
      const tau = s * T;
      const px = lipW.x + vx * tau, py = lipW.y - vy0 * tau - 0.5 * GRAV * tau * tau;
      const vy = vy0 + GRAV * tau, sp2 = Math.hypot(vx, vy);
      const tx = vx / sp2, ty = -vy / sp2, nx = -ty, ny = tx;
      let e = 1;
      if (head < 0.999) e = Math.min(e, (head - s) / 0.05);
      if (tail > 0.001) e = Math.min(e, (s - tail) / 0.08);
      e = Math.sqrt(Math.max(0, Math.min(1, e)));
      // continuity: radius shrinks as the liquid accelerates, with a gentle ripple along its length
      const r = 0.075 * flow * tb.radiusScale * Math.sqrt(speed0 / sp2) * e * (1 + 0.06 * Math.sin(s * 38 - t * 24));
      for (let j = 0; j < TM; j++) {
        const a = (j / TM) * Math.PI * 2, c = Math.cos(a) * r, z = Math.sin(a) * r, o = (i * TM + j) * 3;
        pos[o] = px + nx * c; pos[o + 1] = py + ny * c; pos[o + 2] = z;
      }
    }
    tb.geo.attributes.position.needsUpdate = true;
    tb.geo.computeVertexNormals();
  });
}

/* ---------- impact: splash droplets + surface ripples ---------- */
const DROPS = 80;
const dropMat = liquidMaterial({ opacity: 0.85 }, 0.15);
const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), dropMat, DROPS);
drops.frustumCulled = false; drops.renderOrder = 5; scene.add(drops);
const P = Array.from({ length: DROPS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0.03 }));
const dummy = new THREE.Object3D();
let emitAcc = 0;

const rippleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 });
const ripples = Array.from({ length: 7 }, () => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 56), rippleMat.clone());
  m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 4; scene.add(m);
  return { m, age: 1, life: 1, max: 0.5 };
});
let rippleI = 0, surfR = 0.001;
function spawnRipple(x, y, max, life = 1.3) {
  const r = ripples[rippleI++ % ripples.length];
  r.age = 0; r.life = life; r.max = Math.min(max, Math.max(surfR * 0.92, 0.05));
  r.m.position.set(x, y + 0.004, 0); r.m.visible = true;
}

function updateSplash(dt, impacting, flow, surfY) {
  if (impacting) emitAcc += dt * 110 * flow;
  while (emitAcc >= 1) {
    emitAcc -= 1;
    const d = P.find((q) => q.life <= 0); if (!d) break;
    const a = Math.random() * Math.PI * 2, h = (0.2 + Math.random() * 0.55) * Math.min(1, surfR * 1.4);
    d.life = 0.9; d.s = 0.016 + Math.random() * 0.024;
    d.p.set(impact.x + Math.cos(a) * 0.04, surfY, Math.sin(a) * 0.04);
    d.v.set(Math.cos(a) * h, 1.3 + Math.random() * 1.7 * flow, Math.sin(a) * h);
  }
  P.forEach((d, i) => {
    if (d.life > 0) {
      d.life -= dt; d.v.y -= GRAV * 0.8 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < surfY && d.v.y < 0) { d.life = 0; if (Math.random() < 0.25) spawnRipple(d.p.x, surfY, 0.22, 0.7); }
    }
    dummy.position.copy(d.p);
    dummy.scale.setScalar(d.life > 0 ? d.s * (0.6 + Math.min(1, d.life * 2) * 0.4) : 0.0001);
    dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
  });
  drops.instanceMatrix.needsUpdate = true;
  ripples.forEach((r) => {
    if (r.age >= r.life) { r.m.visible = false; return; }
    r.age += dt;
    const k = Math.min(r.age / r.life, 1), ease = 1 - Math.pow(1 - k, 2.2);
    r.m.scale.setScalar(Math.max(r.max * ease, 0.01));
    r.m.material.opacity = 0.5 * Math.pow(1 - k, 1.6);
  });
}

/* ---------- state driven by GSAP ---------- */
const S = {
  introY: 0, idle: 1, shakerX: 0, shakerY: -2.05, shakerRot: 0, shake: 0,
  glassX: 0, glassY: -7, exitY: 0, fill: 0, pour: 0, pourEnd: 0, flow: 0, canvasFade: 1, spin: 0, splash: 0,
};
const GLASS_BASE = -2.55;
let worldW = 6, wide = true;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const vh = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
  worldW = vh * camera.aspect;
  wide = w > 820;
  glass.scale.setScalar(wide ? 1 : 0.85);
  ScrollTrigger.refresh();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
let lastT = 0;
function tick() {
  const t = clock.getElapsedTime(), dt = Math.min(t - lastT, 0.05); lastT = t;
  syncLiquidColor();

  // shaker: idle float, shake jitter, then scripted pour pose
  const jitter = Math.sin(t * 38) * S.shake;
  shaker.position.set(
    S.shakerX + jitter * 0.08,
    S.shakerY + S.introY + Math.sin(t * 1.3) * 0.04 * S.idle + Math.abs(Math.sin(t * 19)) * S.shake * 0.12, 0);
  shaker.rotation.z = S.shakerRot + jitter * 0.1;

  // glass + liquid level
  glass.position.set(S.glassX, GLASS_BASE + S.glassY + S.exitY, 0);
  glass.rotation.y = S.spin + Math.sin(t * 0.4) * 0.15;
  const gs = glass.scale.y;
  const impacting = S.pour >= 0.999 && S.pourEnd < 0.999 && S.flow > 0.01;
  const agitate = Math.sin(t * 13) * 0.012 * (impacting ? S.flow : 0) + Math.sin(t * 6) * 0.01 * S.splash;
  const level = LIQ_MIN + (LIQ_MAX - LIQ_MIN) * S.fill;
  liquidMat.clippingPlanes[0].constant = glass.position.y + level * gs;
  surface.position.y = level + agitate;
  surfR = Math.max((level - LIQ_MIN) * slope, 0.001) * gs;
  surface.scale.setScalar(Math.max((level - LIQ_MIN) * slope, 0.001));
  surface.visible = liquid.visible = S.fill > 0.001;

  // pour: from the shaker's lip to the liquid surface (or glass bottom while empty)
  shaker.updateMatrixWorld(true);
  lipW.copy(LIP); shaker.localToWorld(lipW);
  const surfY = glass.position.y + level * gs;
  impact.set(glass.position.x, surfY, 0);
  updateStream(t, S.pour, S.pourEnd, S.flow);
  updateSplash(dt, impacting, S.flow, surfY);

  canvas.style.opacity = S.canvasFade;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ---------- intro: shaker rises to its resting spot ---------- */
resize();
tick();
const introTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
introTl
  .from('.nav', { y: -30, opacity: 0, duration: 1 }, 0.2)
  .from('.hero__copy .line > span', { yPercent: 110, duration: 1.3, stagger: 0.15 }, 0.3)
  .from('.eyebrow, .hero__sub, .hero__scroll', { opacity: 0, y: 14, duration: 1, stagger: 0.12 }, 0.9)
  .from(S, { introY: -6, duration: 1.6, ease: 'expo.out' }, 0.2);

/* ---------- hero scroll: shake -> glass rises -> shaker glides over & tilts -> pour -> exit ---------- */
const sideX = () => (wide ? worldW * 0.24 : 0);
const hero = gsap.timeline({
  scrollTrigger: { trigger: '#hero', start: 'top top', end: '+=320%', scrub: 0.8, pin: true, anticipatePin: 1 },
  defaults: { ease: 'none' },
});
const F = { immediateRender: false };
hero
  // copy fades, idle float settles
  .fromTo('.hero__scroll', { opacity: 1 }, { opacity: 0, duration: 0.05, ...F }, 0)
  .fromTo('.hero__copy', { opacity: 1, y: 0 }, { opacity: 0, y: -40, duration: 0.12, ...F }, 0.02)
  .fromTo(S, { idle: 1 }, { idle: 0, duration: 0.06, ...F }, 0)
  // 1. shake
  .fromTo(S, { shake: 0 }, { shake: 1, duration: 0.05, ...F }, 0.04)
  .fromTo(S, { shake: 1 }, { shake: 0, duration: 0.05, ...F }, 0.15)
  // 2. shaker lifts away from its resting spot to hover above the glass; glass rises in behind it
  .fromTo(S, { shakerX: 0, shakerY: -2.05 }, { shakerX: 0.95, shakerY: 1.9, duration: 0.2, ease: 'power2.inOut', ...F }, 0.12)
  .fromTo(S, { glassY: -7 }, { glassY: 0, duration: 0.22, ease: 'power2.out', ...F }, 0.24)
  // 3. tilt, then liquid leaves the lip and falls into the glass
  .fromTo(S, { shakerRot: 0 }, { shakerRot: 1.75, duration: 0.18, ease: 'power2.inOut', ...F }, 0.4)
  .fromTo('#caption', { opacity: 0 }, { opacity: 1, duration: 0.06, ...F }, 0.52)
  .fromTo(S, { flow: 0 }, { flow: 1, duration: 0.05, ...F }, 0.52)
  .fromTo(S, { pour: 0 }, { pour: 1, duration: 0.08, ...F }, 0.52)
  .fromTo(S, { fill: 0 }, { fill: 1, duration: 0.3, ease: 'power1.inOut', ...F }, 0.6)
  // keep tipping as the shaker empties
  .fromTo(S, { shakerRot: 1.75, shakerX: 0.95 }, { shakerRot: 1.95, shakerX: 0.88, duration: 0.3, ...F }, 0.58)
  // 4. flow thins, stream breaks off at the lip
  .fromTo(S, { flow: 1 }, { flow: 0.4, duration: 0.05, ...F }, 0.86)
  .fromTo(S, { pourEnd: 0 }, { pourEnd: 1, duration: 0.06, ...F }, 0.9)
  // 5. shaker rights itself and slides away up and out; glass settles to the side
  .fromTo('#caption', { opacity: 1 }, { opacity: 0, duration: 0.05, ...F }, 0.9)
  .fromTo(S, { shakerRot: 1.95, shakerX: 0.88, shakerY: 1.9 }, { shakerRot: 0, shakerX: 6.5, shakerY: 5.5, duration: 0.1, ease: 'power2.in', ...F }, 0.9)
  .fromTo(S, { glassX: 0 }, { glassX: () => sideX(), duration: 0.1, ease: 'power2.inOut', ...F }, 0.9);
hero.eventCallback('onUpdate', () => {
  document.getElementById('caption').textContent = hero.progress() > 0.75 ? 'Poured with intention.' : 'Shaken, never rushed.';
});

/* fade 3D out as story begins */
gsap.fromTo(S, { canvasFade: 1, exitY: 0 }, {
  canvasFade: 0, exitY: 2, ease: 'none', immediateRender: false,
  scrollTrigger: { trigger: '#story', start: 'top 95%', end: 'top 45%', scrub: true },
});

/* ---------- menu interaction ---------- */
const drinks = document.querySelectorAll('.drink');
drinks.forEach((btn) => btn.addEventListener('click', () => {
  if (btn.classList.contains('is-active')) return;
  drinks.forEach((d) => d.classList.remove('is-active'));
  btn.classList.add('is-active');
  const c = new THREE.Color(btn.dataset.color);
  gsap.to(liquidColor, { r: c.r, g: c.g, b: c.b, duration: 0.9, ease: 'power2.out' });
  spawnRipple(glass.position.x, glass.position.y + (LIQ_MIN + (LIQ_MAX - LIQ_MIN) * S.fill) * glass.scale.y, 0.8, 1.6);
  gsap.fromTo(S, { splash: 1 }, { splash: 0, duration: 1.4 });
  gsap.to(S, { spin: S.spin + Math.PI * 2, duration: 1.4, ease: 'power3.inOut' });
  gsap.fromTo(S, { fill: 0.75 }, { fill: 1, duration: 1.1, ease: 'elastic.out(1,.5)' });
}));

/* ---------- reveals ---------- */
gsap.utils.toArray('.reveal').forEach((el) => {
  gsap.from(el, { y: 36, opacity: 0, duration: 1.1, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' } });
});
gsap.from('.drinks li', { x: -30, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out',
  scrollTrigger: { trigger: '#drinks', start: 'top 80%' } });

/* story video parallax + lazy second video */
gsap.utils.toArray('.frame video').forEach((v) => {
  gsap.fromTo(v, { yPercent: -6 }, { yPercent: 6, ease: 'none',
    scrollTrigger: { trigger: v.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
});
const lazy = document.querySelector('video[data-lazy]');
new IntersectionObserver((e, o) => {
  if (e[0].isIntersecting) { lazy.src = lazy.dataset.lazy; lazy.play().catch(() => {}); o.disconnect(); }
}, { rootMargin: '300px' }).observe(lazy);

/* smooth anchor scrolling */
document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const t = document.querySelector(a.getAttribute('href'));
  if (!t) return;
  e.preventDefault();
  window.scrollTo({ top: t.getBoundingClientRect().top + scrollY, behavior: 'smooth' });
}));
