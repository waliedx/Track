// confetti.js — Lightweight canvas confetti animation module
(() => {
  const DEFAULTS = {
    particleCount: 50,
    spread: 70,
    startVelocity: 30,
    colors: ['#4f8cff', '#ff6b8a', '#34d399', '#fbbf24', '#a855f7', '#f97316'],
    origin: { x: 0.5, y: 0.9 }
  };

  function createCanvas() {
    const c = document.createElement('canvas');
    Object.assign(c.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '9999'
    });
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    document.body.appendChild(c);
    return c;
  }

  function randomRange(min, max) { return Math.random() * (max - min) + min; }

  function createParticle(opts) {
    const angle = (opts.origin.angle || -90) * (Math.PI / 180) +
      randomRange(-opts.spread / 2, opts.spread / 2) * (Math.PI / 180);
    const v = opts.startVelocity * randomRange(0.5, 1);
    return {
      x: opts.origin.x * window.innerWidth,
      y: opts.origin.y * window.innerHeight,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      rotation: randomRange(0, 360),
      rotationSpeed: randomRange(-10, 10),
      size: randomRange(4, 8),
      color: opts.colors[Math.floor(Math.random() * opts.colors.length)],
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
      opacity: 1
    };
  }

  function animateBurst(opts) {
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    const particles = Array.from({ length: opts.particleCount }, () => createParticle(opts));
    const gravity = 0.5;
    const drag = 0.97;
    const fadeSpeed = 0.005;
    let raf;

    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of particles) {
        p.vy += gravity;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        if (p.y > canvas.height + 20) p.opacity -= 0.05;
        else p.opacity -= fadeSpeed;
        if (p.opacity <= 0) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        canvas.remove();
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function burst(options = {}) {
    animateBurst({ ...DEFAULTS, ...options, origin: { ...DEFAULTS.origin, angle: -90, ...options.origin } });
  }

  function celebrate(options = {}) {
    const opts = { ...DEFAULTS, particleCount: 150, ...options };
    const origins = [
      { x: 0.3, y: 0.9, angle: -70 },
      { x: 0.5, y: 0.85, angle: -90 },
      { x: 0.7, y: 0.9, angle: -110 }
    ];
    origins.forEach((o, i) => {
      setTimeout(() => animateBurst({ ...opts, origin: { ...o, ...options.origin }, particleCount: Math.round(opts.particleCount / 3) }), i * 200);
    });
  }

  window.Confetti = { burst, celebrate };
})();
