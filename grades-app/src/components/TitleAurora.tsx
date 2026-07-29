'use client';

import { useEffect, useRef } from 'react';

/**
 * Шейдерный фон за заголовками страниц (референс — Яндекс Музыка):
 * крупные мягкие «капли»-градиенты в чистых фирменных цветах (лайм,
 * изумруд, небесный), дрейфующие по медленным орбитам. Взвешенная смесь
 * чистых цветов — без мутного перемешивания шумовых туманов.
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

// Мягкая гауссова «капля»
float g(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  return exp(-dot(d, d) / (r * r));
}

void main() {
  vec2 frag = gl_FragCoord.xy / u_res;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_t * 0.6;

  // Четыре крупные капли на медленных несоизмеримых орбитах —
  // рисунок никогда не повторяется точь-в-точь.
  vec2 p1 = vec2(sin(t * 0.30) * 0.85, cos(t * 0.23) * 0.28);
  vec2 p2 = vec2(cos(t * 0.21) * 0.95, sin(t * 0.27) * 0.32);
  vec2 p3 = vec2(sin(t * 0.17 + 2.1) * 0.70, cos(t * 0.33 + 1.3) * 0.30);
  vec2 p4 = vec2(cos(t * 0.26 + 4.0) * 0.55, sin(t * 0.19 + 0.6) * 0.26);

  float w1 = g(uv, p1, 0.46);
  float w2 = g(uv, p2, 0.42) * 0.9;
  float w3 = g(uv, p3, 0.52) * 0.8;
  float w4 = g(uv, p4, 0.38) * 0.85;

  // Цвет — взвешенная смесь ЧИСТЫХ фирменных цветов: в зоне каждой капли
  // доминирует её цвет, на стыках — чистые градиентные переходы
  // (никакого мутного перемешивания, как у шумовых туманов).
  vec3 col = (u_c1 * (w1 + w4 * 0.6) + u_c2 * w2 + u_c3 * w3)
           / (w1 + w4 * 0.6 + w2 + w3 + 1e-4);

  float total = w1 + w2 + w3 + w4;
  float a = smoothstep(0.13, 0.8, total);

  // Эллиптическая виньетка — края канваса растворяются в фоне страницы
  vec2 m = (frag - 0.5) * vec2(2.0, 2.3);
  float vig = 1.0 - smoothstep(0.42, 1.0, length(m));

  gl_FragColor = vec4(col, a * vig * u_alpha);
}
`;

type Palette = { c1: number[]; c2: number[]; c3: number[]; a: number };

function palette(): Palette {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return light
    ? {
        // светлая тема: чистая тёплая гамма без синего (синий на белом
        // серел и грязнил) — лайм, изумруд, мята поверх white→#F3F3F3
        c1: [0.76, 0.9, 0.08], // лайм
        c2: [0.2, 0.78, 0.35], // emerald
        c3: [0.45, 0.83, 0.68], // мята
        a: 0.42,
      }
    : {
        c1: [0.835, 1.0, 0.047], // лайм #d5ff0c
        c2: [0.19, 0.82, 0.35], // emerald
        c3: [0.05, 0.65, 0.91], // sky
        a: 0.55,
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
      // preserveDrawingBuffer сознательно НЕ включаем. Пробовали 29.07.2026
      // против моргания стеклянного хедера — не помогло (причина была не в
      // паузе rAF, а в backdrop-filter, который сэмплит этот канвас), зато
      // буфер стал дороже композитить. А пустой буфер на паузе увидеть
      // нельзя: с rootMargin ниже канвас останавливается, только уйдя за
      // экран на 240px.
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
        // Рисуем кадр сразу, не дожидаясь rAF: иначе между снятием с паузы
        // и первым кадром успевает пройти композиция с прошлым буфером.
        draw(performance.now());
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

    // rootMargin даёт гистерезис: у самой кромки вьюпорта состояние не
    // дёргается туда-обратно на каждом кадре скролла.
    const io = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting;
        sync();
      },
      { rootMargin: '240px' },
    );
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
                  pointer-events-none w-[min(1920px,100vw)] h-[964px] ${className}`}
    />
  );
}
