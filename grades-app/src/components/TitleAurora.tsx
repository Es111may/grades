'use client';

import { useEffect, useRef } from 'react';

/**
 * Шейдерная «аврора» за заголовками страниц (референс — sui.io / Яндекс
 * Музыка): медленно плывущие органические волны в фирменных цветах
 * (лайм → изумруд → небесный) на WebGL fragment-шейдере с domain-warped
 * fbm-шумом.
 *
 * Поведение:
 *  - тема: палитра и альфа переключаются живьём по data-theme (MutationObserver);
 *  - перфоманс: рендер в полразрешения (шум мягкий — разницы не видно),
 *    пауза когда канвас вне вьюпорта или вкладка скрыта;
 *  - prefers-reduced-motion: один статичный кадр без анимации;
 *  - нет WebGL — остаётся чистый фон (прогрессивное улучшение).
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_t;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_alpha;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy / u_res;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_t * 0.06;

  // Domain warping: шум, искажающий координаты другого шума — даёт
  // «жидкие» переливающиеся формы (классика sui-подобных фонов).
  vec2 q = vec2(
    fbm(uv * 1.3 + vec2(0.0, t * 1.2)),
    fbm(uv * 1.3 - vec2(t * 0.9, 0.0))
  );
  vec2 r = vec2(
    fbm(uv * 1.3 + 2.6 * q + vec2(1.7, 9.2) + t * 0.7),
    fbm(uv * 1.3 + 2.6 * q + vec2(8.3, 2.8) - t * 0.5)
  );
  float f = fbm(uv * 1.3 + 2.4 * r);

  vec3 col = mix(u_c1, u_c2, smoothstep(0.25, 0.85, f));
  col = mix(col, u_c3, smoothstep(0.4, 0.95, q.y) * 0.55);

  float glow = smoothstep(0.28, 0.95, f * 0.75 + 0.45 * r.x);

  // Эллиптическая виньетка — края канваса растворяются в фоне страницы
  vec2 m = (frag - 0.5) * vec2(2.0, 2.3);
  float vig = 1.0 - smoothstep(0.45, 1.0, length(m));

  gl_FragColor = vec4(col, glow * vig * u_alpha);
}
`;

type Palette = { c1: number[]; c2: number[]; c3: number[]; a: number };

function palette(): Palette {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return light
    ? {
        // светлая тема: те же фирменные цвета, но глуше — текст ink
        // должен оставаться читабельным
        c1: [0.66, 0.8, 0.0], // приглушённый лайм (--c-lime-dark)
        c2: [0.13, 0.72, 0.3], // emerald
        c3: [0.02, 0.62, 0.85], // sky
        a: 0.34,
      }
    : {
        c1: [0.835, 1.0, 0.047], // лайм #d5ff0c
        c2: [0.19, 0.82, 0.35], // emerald
        c3: [0.05, 0.65, 0.91], // sky
        a: 0.5,
      };
}

export default function TitleAurora({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;

    function compile(type: number, src: string) {
      const sh = gl!.createShader(type)!;
      gl!.shaderSource(sh, src);
      gl!.compileShader(sh);
      return sh;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uT = gl.getUniformLocation(prog, 'u_t');
    const uC1 = gl.getUniformLocation(prog, 'u_c1');
    const uC2 = gl.getUniformLocation(prog, 'u_c2');
    const uC3 = gl.getUniformLocation(prog, 'u_c3');
    const uA = gl.getUniformLocation(prog, 'u_alpha');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pal = palette();
    let raf = 0;
    let inView = true;
    let running = false;
    const t0 = performance.now();

    function resize() {
      // Полразрешения: шум мягкий, на глаз неотличимо, GPU-время ×4 меньше
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      const w = Math.max(1, Math.round(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas!.clientHeight * dpr));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }

    function draw(now: number) {
      resize();
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uT, (now - t0) / 1000);
      gl!.uniform3fv(uC1, pal.c1);
      gl!.uniform3fv(uC2, pal.c2);
      gl!.uniform3fv(uC3, pal.c3);
      gl!.uniform1f(uA, pal.a);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    function loop(now: number) {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    function sync() {
      const shouldRun = inView && !document.hidden && !reduced;
      if (shouldRun && !running) {
        running = true;
        raf = requestAnimationFrame(loop);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    }

    // Смена темы — живьём (без перезагрузки)
    const mo = new MutationObserver(() => {
      pal = palette();
      if (reduced) draw(performance.now());
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      sync();
    });
    io.observe(canvas);

    const onVis = () => sync();
    document.addEventListener('visibilitychange', onVis);

    if (reduced) {
      draw(performance.now());
    } else {
      sync();
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -z-10
                  pointer-events-none w-[min(1100px,96vw)] h-[440px] ${className}`}
    />
  );
}
