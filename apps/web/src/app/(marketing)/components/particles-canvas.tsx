'use client';

import { palette } from '@anbaro/design-tokens';
import { useEffect, useRef } from 'react';

class Particle {
  x = 0;
  y = 0;
  size = 0;
  speedX = 0;
  speedY = 0;
  opacity = 0;
  color: string = palette.lobsterPink;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.reset();
  }

  reset() {
    this.x = Math.random() * this.width;
    this.y = Math.random() * this.height;
    this.size = Math.random() * 3 + 1;
    this.speedX = (Math.random() - 0.5) * 0.5;
    this.speedY = (Math.random() - 0.5) * 0.5;
    this.opacity = Math.random() * 0.3 + 0.1;
    this.color = Math.random() > 0.5 ? palette.lobsterPink : palette.tangerineDream;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x < 0 || this.x > this.width || this.y < 0 || this.y > this.height) this.reset();
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.opacity;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Decorative particle background, confined to the hero section. Isolated as its own client leaf so the rest of the page can stay server-rendered. */
export function ParticlesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationId = 0;

    function resizeCanvas() {
      if (!canvas || !parent) return;
      canvas.width = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    }

    function initParticles() {
      if (!canvas) return;
      resizeCanvas();
      const count = Math.min(50, Math.floor((canvas.width * canvas.height) / 20000));
      particles = Array.from({ length: count }, () => new Particle(canvas.width, canvas.height));
    }

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const particle of particles) {
        particle.update();
        particle.draw(ctx);
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          if (!a || !b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = palette.lobsterPink;
            ctx.globalAlpha = 0.05 * (1 - dist / 120);
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      animationId = requestAnimationFrame(animate);
    }

    initParticles();
    animate();

    function onResize() {
      resizeCanvas();
    }
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas aria-hidden="true" className="mkt-particles-canvas" ref={canvasRef} />;
}
