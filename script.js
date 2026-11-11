/* =========================================================
   11:11 — interactions
   1. Password lock   2. Three-touch flying letter   3. Message
   Three.js background is optional: if the CDN fails, CSS stars remain.
   ========================================================= */

(function () {
  "use strict";

  // ---------- Config ----------
  const CORRECT_PASSWORD = "14102008";
  const TOTAL_TOUCHES = 3;
  const TOUCH_COOLDOWN_MS = 350;      // ignore accidental double-fires
  const UNLOCK_DURATION_MS = 1700;    // lock animation before moving on
  const FINAL_HOLD_MS = 2600;         // time between final flash and message screen
  const WRONG_MESSAGES = [
    "لأ، ده مش هو الباسورد 🤍",
    "جربي تاني، إنتي عارفاه",
    "مش كده يا قمر… فكّري تاني",
  ];

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const rand = (min, max) => min + Math.random() * (max - min);
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Convert Arabic-Indic digits (٠-٩) to Western digits, so phone keyboards work too.
  function normalizeDigits(str) {
    return str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
              .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  }

  function showScreen(id) {
    $$(".screen").forEach((s) => {
      const on = s.id === id;
      s.classList.toggle("active", on);
      s.setAttribute("aria-hidden", on ? "false" : "true");
    });
  }

  // ---------- Screen 1: lock ----------
  const form = $("#lock-form");
  const input = $("#password");
  const inputWrap = $("#input-wrap");
  const errorMsg = $("#error-msg");
  const lock3d = $("#lock3d");
  const unlockBtn = $(".unlock-btn");
  let errorTimer = null;
  let unlocking = false;

  function showError(text) {
    errorMsg.textContent = text;
    errorMsg.classList.add("show");
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => errorMsg.classList.remove("show"), 2600);

    // restart shake animations
    restartClass(lock3d, "shake");
    restartClass(inputWrap, "error");
    input.select();
  }

  function restartClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow so the animation replays
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  function unlockSequence() {
    unlocking = true;
    unlockBtn.disabled = true;
    input.blur();
    lock3d.classList.add("open");
    errorMsg.classList.remove("show");

    setTimeout(() => {
      $("#screen-lock").classList.remove("active");
      startLetterScreen();
    }, UNLOCK_DURATION_MS);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (unlocking) return;

    const entered = normalizeDigits(input.value.trim());
    if (entered === CORRECT_PASSWORD) {
      unlockSequence();
    } else {
      const msg = entered === "" ? "اكتبي الباسورد الأول 🤍" : WRONG_MESSAGES[Math.floor(Math.random() * WRONG_MESSAGES.length)];
      showError(msg);
    }
  });

  // Keep only digits typed
  input.addEventListener("input", () => {
    const cleaned = normalizeDigits(input.value).replace(/\D/g, "").slice(0, 12);
    if (cleaned !== input.value) input.value = cleaned;
  });

  // ---------- Screen 2: flying letter ----------
  const stage = $("#letter-stage");
  const letterWrap = $("#letter-wrap");
  const counter = $("#touch-counter");
  let touches = 0;
  let lastTouchAt = 0;
  let lastPos = { x: 0, y: 0 };
  let letterBusy = false;

  function setCounter(n) {
    counter.textContent = `${n}/${TOTAL_TOUCHES}`;
    restartClass(counter, "bump");
  }

  function setPosition(x, y, { scale = 1 } = {}) {
    letterWrap.style.setProperty("--tx", `${x}px`);
    letterWrap.style.setProperty("--ty", `${y}px`);
    letterWrap.style.setProperty("--s", String(scale));
    lastPos = { x, y };
  }

  // Random destination inside the stage, away from the header and hint text,
  // and noticeably far from the current position so each escape feels real.
  function randomTarget() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const lw = letterWrap.offsetWidth;
    const lh = letterWrap.offsetHeight;

    const maxX = Math.max(0, w / 2 - lw / 2 - 12);
    const minY = -h * 0.22;   // keep clear of the header
    const maxY = h * 0.18;    // keep clear of the hint
    const yHalf = Math.max(0, (maxY - minY) / 2);
    const yMid = (maxY + minY) / 2;

    let x, y, tries = 0;
    do {
      x = rand(-maxX, maxX);
      y = yMid + rand(-yHalf, yHalf);
      tries++;
    } while (
      tries < 20 &&
      Math.hypot(x - lastPos.x, y - lastPos.y) < Math.min(w, h) * 0.35
    );
    return { x: Math.round(x), y: Math.round(y) };
  }

  function puffAt(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "puff";
      p.style.left = `calc(50% + ${x}px)`;
      p.style.top = `calc(50% + ${y}px)`;
      stage.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  function burst(x, y, amount = 28) {
    for (let i = 0; i < amount; i++) {
      const s = document.createElement("span");
      s.className = "spark";
      const angle = (Math.PI * 2 * i) / amount + rand(-0.15, 0.15);
      const dist = rand(120, 320);
      s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      s.style.left = `calc(50% + ${x}px)`;
      s.style.top = `calc(50% + ${y}px)`;
      s.style.animationDelay = `${rand(0, 0.12)}s`;
      stage.appendChild(s);
      setTimeout(() => s.remove(), 1900);
    }
  }

  function handleTouch() {
    // Touches are accepted even while the letter is mid-flight, so a tap on it always counts.
    if (touches >= TOTAL_TOUCHES) return;

    const now = performance.now();
    if (now - lastTouchAt < TOUCH_COOLDOWN_MS) return;
    lastTouchAt = now;

    touches++;
    setCounter(touches);

    // Shared: puff at the current spot, then glow level
    puffAt(lastPos.x, lastPos.y);
    letterWrap.classList.toggle("level-1", touches === 1);
    letterWrap.classList.toggle("level-2", touches === 2);

    if (touches < TOTAL_TOUCHES) {
      // Touches 1 & 2: the letter escapes to a new random spot
      letterBusy = true;
      letterWrap.classList.add("escaping");
      const t = randomTarget();
      const scale = touches === 1 ? 1 : 1.04;
      setPosition(t.x, t.y, { scale });
      setTimeout(() => {
        letterWrap.classList.remove("escaping");
        letterBusy = false;
      }, 750);
    } else {
      // Touch 3: the letter stops, glows, flashes, then opens the message
      finalCatch();
    }
  }

  function finalCatch() {
    letterBusy = true;
    stage.classList.add("done");
    letterWrap.classList.add("final");
    letterWrap.classList.remove("escaping");

    // glide to the centre and stop
    setPosition(0, 0, { scale: 1.12 });

    if (!reducedMotion) {
      setTimeout(() => {
        burst(0, 0);
        const flash = $("#flash");
        flash.classList.remove("go");
        void flash.offsetWidth;
        flash.classList.add("go");
      }, 800);
    }

    setTimeout(() => {
      $("#screen-letter").classList.remove("active");
      showMessage();
    }, FINAL_HOLD_MS);
  }

  function startLetterScreen() {
    touches = 0;
    lastTouchAt = 0;
    letterBusy = false;
    stage.classList.remove("done");
    letterWrap.classList.remove("final", "escaping", "level-1", "level-2");
    setCounter(0);
    setPosition(0, 0, { scale: 1 });
    showScreen("screen-letter");
  }

  // Pointer (mouse / touch / pen) — single handler covers desktop and touchscreens
  letterWrap.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handleTouch();
  });

  letterWrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleTouch();
    }
  });

  // Mouse parallax on the letter tilt (desktop only)
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches && !reducedMotion) {
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      letterWrap.style.setProperty("--ry", `${nx * 18}deg`);
      letterWrap.style.setProperty("--rx", `${-ny * 14}deg`);
    });
    stage.addEventListener("pointerleave", () => {
      letterWrap.style.setProperty("--ry", "0deg");
      letterWrap.style.setProperty("--rx", "0deg");
    });
  }

  // ---------- Screen 3: message ----------
  let messageRevealed = false;

  function buildPetals(count = 22) {
    const box = $("#petals");
    if (box.childElementCount) return;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "petal";
      p.style.left = `${rand(0, 100)}%`;
      p.style.setProperty("--dur", `${rand(10, 18).toFixed(1)}s`);
      p.style.setProperty("--delay", `${rand(-18, 0).toFixed(1)}s`);
      p.style.setProperty("--sway", `${rand(-50, 50).toFixed(0)}px`);
      p.style.transform = `scale(${rand(0.6, 1.1).toFixed(2)})`;
      box.appendChild(p);
    }
  }

  function showMessage() {
    showScreen("screen-message");
    buildPetals(reducedMotion ? 0 : 22);
    if (messageRevealed) return;
    messageRevealed = true;

    // sequential text reveal
    const items = $$(".reveal");
    items.forEach((el, i) => {
      el.style.setProperty("--d", `${(0.6 + i * 0.45).toFixed(2)}s`);
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => items.forEach((el) => el.classList.add("in")));
    });
  }

  // ---------- Three.js background (optional) ----------
  const canvas = $("#bg-canvas");

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function initThree() {
    if (typeof THREE === "undefined" || reducedMotion) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    const isMobile = window.innerWidth < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 14;

    // Lights
    scene.add(new THREE.AmbientLight(0x3a1a2a, 0.9));
    const warm = new THREE.PointLight(0xe8d3a8, 1.2, 40);
    warm.position.set(-6, 5, 8);
    scene.add(warm);
    const rose = new THREE.PointLight(0xb0173a, 1.4, 40);
    rose.position.set(6, -4, 6);
    scene.add(rose);

    // Particle field
    const count = isMobile ? 260 : 420;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color(0xfff8f0),
      new THREE.Color(0xe8d3a8),
      new THREE.Color(0xd8a7b1),
    ];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = rand(-22, 22);
      positions[i * 3 + 1] = rand(-14, 14);
      positions[i * 3 + 2] = rand(-20, 6);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Floating glowing rings (3D depth elements)
    const rings = [];
    const ringMat = (color, opacity) => new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity,
      roughness: 0.4,
      metalness: 0.6,
    });
    const ringSpecs = [
      { r: 3.2, t: 0.06, x: -6, y: 2.5, z: -4, c: 0xe8d3a8, o: 0.35 },
      { r: 2.2, t: 0.05, x: 7, y: -3, z: -7, c: 0xd8a7b1, o: 0.3 },
      { r: 1.6, t: 0.04, x: 2, y: 5, z: -10, c: 0x8a2c50, o: 0.45 },
    ];
    if (!isMobile) {
      ringSpecs.push({ r: 4.2, t: 0.05, x: 9, y: 4, z: -12, c: 0xe8d3a8, o: 0.22 });
    }
    ringSpecs.forEach((s) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(s.r, s.t, 12, 80), ringMat(s.c, s.o));
      mesh.position.set(s.x, s.y, s.z);
      mesh.userData = { baseY: s.y, speed: rand(0.2, 0.5), phase: rand(0, Math.PI * 2) };
      scene.add(mesh);
      rings.push(mesh);
    });

    // Parallax
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (x, y) => {
      mouse.tx = (x / window.innerWidth - 0.5) * 2;
      mouse.ty = (y / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY), { passive: true });
    window.addEventListener("deviceorientation", (e) => {
      if (e.gamma == null) return;
      mouse.tx = Math.max(-1, Math.min(1, e.gamma / 30));
      mouse.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    }, { passive: true });

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    let running = true;
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) loop();
    });

    const clock = new THREE.Clock();
    function loop() {
      if (!running) return;
      requestAnimationFrame(loop);
      const t = clock.getElapsedTime();

      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      camera.position.x = mouse.x * 1.2;
      camera.position.y = -mouse.y * 0.8;
      camera.lookAt(0, 0, 0);

      particles.rotation.y = t * 0.02;
      particles.position.y = Math.sin(t * 0.15) * 0.3;

      rings.forEach((r) => {
        const u = r.userData;
        r.position.y = u.baseY + Math.sin(t * u.speed + u.phase) * 0.6;
        r.rotation.x = t * 0.15 + u.phase;
        r.rotation.y = t * 0.1;
      });

      warm.intensity = 1.1 + Math.sin(t * 0.8) * 0.2;
      renderer.render(scene, camera);
    }
    loop();
    canvas.classList.add("ready");
  }

  // Load Three.js from cdnjs (free). Failure is silent: CSS stars still show.
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js")
    .then(initThree)
    .catch(() => { /* no 3D background; the page still works */ });

  // ---------- Init ----------
  showScreen("screen-lock");
  // autofocus only on larger screens to avoid popping the keyboard on phones
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
    setTimeout(() => input.focus({ preventScroll: true }), 900);
  }
})();
