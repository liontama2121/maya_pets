import { animate, createAnimatable, createSpring, createTimeline, stagger, utils } from "animejs";

/**
 * Maya es invisible: solo se ven sus huellas y los juguetes que mueve.
 * Todo aquí respeta prefers-reduced-motion (sin movimiento, contenido visible).
 */

export const reduceMotion = () =>
  typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const squish = createSpring({ mass: 1, stiffness: 260, damping: 12 });

/** Clona la huella desde <template id="paw-tpl"> (ícono PawPrint de Phosphor). */
function makePaw(size = 28): HTMLElement {
  const tpl = document.getElementById("paw-tpl") as HTMLTemplateElement | null;
  const el = document.createElement("span");
  el.className = "maya-paw";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;pointer-events:none;z-index:60;color:var(--paw-color, var(--accent));opacity:0;will-change:transform,opacity`;
  if (tpl) el.appendChild(tpl.content.cloneNode(true));
  document.body.appendChild(el);
  return el;
}

/**
 * Rastro de huellas de A a B, alternando izquierda/derecha como una caminata.
 * Devuelve una promesa que resuelve cuando la última huella aparece.
 */
export function pawTrail(
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { steps?: number; size?: number; color?: string; stepMs?: number } = {},
): Promise<void> {
  if (reduceMotion()) return Promise.resolve();
  const { size = 26, stepMs = 110 } = opts;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = opts.steps ?? Math.max(3, Math.min(12, Math.round(dist / 70)));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);

  const paws = Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / (steps + 1);
    const side = i % 2 === 0 ? 1 : -1;
    const el = makePaw(size);
    if (opts.color) el.style.setProperty("--paw-color", opts.color);
    const x = from.x + dx * t + nx * side * 9 - size / 2;
    const y = from.y + dy * t + ny * side * 9 - size / 2;
    utils.set(el, { x, y, rotate: angle + side * 8, scale: 0.6 });
    return el;
  });

  return new Promise((resolve) => {
    createTimeline({ onComplete: () => paws.forEach((p) => p.remove()) })
      .add(paws, { opacity: [0, 0.95], scale: [0.6, 1], duration: 180, ease: "outQuad" }, stagger(stepMs))
      .call(() => resolve(), `<<+=${stepMs}`)
      .add(paws, { opacity: 0, duration: 520, ease: "inQuad" }, stagger(stepMs, { start: stepMs * 3 }));
  });
}

/** Rebote de caucho al soltar un botón (complementa el :active de CSS). */
export function initSquishButtons(root: ParentNode = document) {
  if (reduceMotion()) return;
  root.addEventListener(
    "pointerup",
    (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>(".btn, .chip, [data-squish]");
      if (!btn || btn.matches(":disabled,[aria-disabled='true']")) return;
      animate(btn, { scaleX: [1.06, 1], scaleY: [0.92, 1], ease: squish });
    },
    { passive: true },
  );
}

/**
 * Maya en el hero: invisible, solo su sombra y sus huellas.
 * Llega caminando al cargar. En computador sigue el cursor; en celular se acomoda al inclinarlo.
 * Si te quedas quieto, se sienta y habla.
 *
 * - `zone`: el hero completo (donde se escucha el puntero).
 * - `home`: dónde descansa al cargar.
 * - `body`: sombra + huellas sentadas + globo (se mueve con transform).
 * - `trail`: capa donde caen las huellas al caminar.
 * - `bubble`: el globo de diálogo.
 */
export function initMayaFollow(opts: {
  zone: HTMLElement;
  home: HTMLElement;
  body: HTMLElement;
  trail: HTMLElement;
  bubble: HTMLElement;
}) {
  const { zone, home, body, trail, bubble } = opts;

  const zoneRect = () => zone.getBoundingClientRect();
  const homePoint = () => {
    const z = zoneRect();
    const h = home.getBoundingClientRect();
    return { x: h.left - z.left + h.width / 2, y: h.top - z.top + h.height * 0.62 };
  };

  const start = homePoint();

  /** Muestra el globo. `at` es dónde queda sentada (coordenadas del hero). */
  const say = (text: string, at: { x: number; y: number }) => {
    bubble.textContent = text;
    // Siempre dentro del hero: se corre lo necesario a la izquierda o a la derecha.
    const width = bubble.offsetWidth;
    const z = zoneRect();
    const left = at.x - 24;
    let shift = 0;
    if (left + width > z.width - 12) shift = z.width - 12 - (left + width);
    if (left + shift < 12) shift = 12 - left;
    bubble.style.left = `${-24 + shift}px`;
    bubble.dataset.show = "true";
  };
  const hush = () => {
    bubble.dataset.show = "false";
  };
  const GREETING = "Hola, soy Maya. No me ves, pero aquí estoy.";

  // Sin movimiento: sentada en su sitio desde el principio.
  if (reduceMotion()) {
    utils.set(body, { x: start.x, y: start.y });
    say(GREETING, start);
    return () => {};
  }

  // Entra caminando desde el borde derecho.
  const entry = { x: zoneRect().width + 60, y: start.y };
  utils.set(body, { x: entry.x, y: entry.y });

  // Respira: la sombra se ensancha y se encoge muy despacio.
  const shadow = body.querySelector<HTMLElement>("[data-maya-shadow]");
  const breathe = shadow
    ? animate(shadow, { scaleX: [1, 1.06], duration: 1800, alternate: true, loop: true, ease: "inOutSine" })
    : null;

  // Seguimiento suave: la sombra persigue el objetivo con algo de retraso.
  const follower = createAnimatable(body, { x: 900, y: 900, ease: "outQuad" });

  let target = { ...entry };
  let last = { ...entry };
  let side = 1;
  let travelled = 0;
  let raf = 0;
  let idle: number | undefined;
  let moves = 0;
  const STEP = 42;
  const MAX_PAWS = 16;

  const dropPaw = (x: number, y: number, angle: number) => {
    if (trail.childElementCount >= MAX_PAWS) trail.firstElementChild?.remove();
    const tpl = document.getElementById("paw-tpl") as HTMLTemplateElement | null;
    const paw = document.createElement("span");
    paw.setAttribute("aria-hidden", "true");
    paw.className = "maya-step";
    if (tpl) paw.appendChild(tpl.content.cloneNode(true));
    const rad = (angle * Math.PI) / 180;
    const ox = Math.cos(rad) * 10 * side;
    const oy = Math.sin(rad) * 10 * side;
    utils.set(paw, { x: x + ox - 11, y: y + oy - 11, rotate: angle + 90, opacity: 0, scale: 0.7 });
    trail.appendChild(paw);
    side *= -1;
    createTimeline({ onComplete: () => paw.remove() })
      .add(paw, { opacity: 0.75, scale: 1, duration: 160, ease: "outQuad" })
      .add(paw, { opacity: 0, duration: 900, ease: "inQuad" }, "+=500");
  };

  // Mientras se mueve, deja huellas en el camino real de la sombra.
  const tick = () => {
    const x = follower.x() as number;
    const y = follower.y() as number;
    const dx = x - last.x;
    const dy = y - last.y;
    const d = Math.hypot(dx, dy);
    travelled += d;
    if (travelled >= STEP) {
      dropPaw(x, y, (Math.atan2(dy, dx) * 180) / Math.PI);
      travelled = 0;
    }
    last = { x, y };
    if (Math.hypot(target.x - x, target.y - y) > 2) raf = requestAnimationFrame(tick);
    else raf = 0;
  };

  const goTo = (x: number, y: number, message?: string) => {
    const z = zoneRect();
    // Se mantiene dentro del hero, con margen para el globo.
    target = {
      x: Math.min(Math.max(x, 70), z.width - 70),
      y: Math.min(Math.max(y, 110), z.height - 30),
    };
    const dist = Math.hypot(target.x - (follower.x() as number), target.y - (follower.y() as number));
    const duration = message === GREETING ? 1900 : Math.min(1400, 350 + dist * 1.4);
    follower.x(target.x, duration);
    follower.y(target.y, duration);
    body.dataset.walking = "true";
    hush();
    if (!raf) raf = requestAnimationFrame(tick);
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      body.dataset.walking = "false";
      if (message) say(message, target);
      else {
        moves += 1;
        say(moves > 1 ? "¿Vamos a la tienda?" : "Te sigo a donde vayas.", target);
      }
    }, Math.max(duration, 900));
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const z = zoneRect();
    // Se sienta al lado del cursor, no debajo.
    goTo(e.clientX - z.left + 44, e.clientY - z.top + 36);
  };
  // Celular: al inclinar el teléfono se acomoda hacia ese lado (sin pedir permisos).
  let tiltTimer: number | undefined;
  let arrived = false;
  const onTilt = (e: DeviceOrientationEvent) => {
    if (!arrived || e.gamma == null) return;
    window.clearTimeout(tiltTimer);
    tiltTimer = window.setTimeout(() => {
      const h = homePoint();
      const shift = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 30)) * 70;
      if (Math.abs(shift) < 12) return;
      goTo(h.x + shift, h.y, shift > 0 ? "Por aquí se ve mejor." : "Me acomodo de este lado.");
    }, 250);
  };
  const onLeave = () => {
    const h = homePoint();
    goTo(h.x, h.y, "Aquí te espero.");
  };
  const onResize = () => {
    const h = homePoint();
    follower.x(h.x, 0);
    follower.y(h.y, 0);
    last = { ...h };
    target = { ...h };
  };

  // Primero llega; después escucha al cursor o a la inclinación.
  const arrival = window.setTimeout(() => {
    goTo(start.x, start.y, GREETING);
    window.setTimeout(() => {
      arrived = true;
      zone.addEventListener("pointermove", onMove);
      zone.addEventListener("pointerleave", onLeave);
    }, 1900);
  }, 700);
  window.addEventListener("resize", onResize);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) window.addEventListener("deviceorientation", onTilt);

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(idle);
    window.clearTimeout(arrival);
    window.clearTimeout(tiltTimer);
    window.removeEventListener("deviceorientation", onTilt);
    breathe?.revert();
    zone.removeEventListener("pointermove", onMove);
    zone.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("resize", onResize);
  };
}

/** Vuelo al carrito: la imagen del producto viaja en arco y Maya la acompaña. */
export function flyToCart(source: HTMLElement | null) {
  const target = document.querySelector<HTMLElement>("[data-cart-target]");
  if (!target) return;
  const bump = () => animate(target, { scale: [1.25, 1], ease: squish });
  if (!source || reduceMotion()) {
    bump();
    return;
  }
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText = `position:fixed;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;margin:0;z-index:70;pointer-events:none;border-radius:20px;overflow:hidden`;
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.max(0.12, 40 / Math.max(from.width, 1));

  void pawTrail(
    { x: from.left + from.width / 2, y: from.top + from.height / 2 },
    { x: to.left + to.width / 2, y: to.top + to.height / 2 },
    { size: 18, stepMs: 60 },
  );

  createTimeline({
    onComplete: () => {
      ghost.remove();
      bump();
    },
  })
    .add(ghost, { x: dx, duration: 620, ease: "inOutQuad" }, 0)
    .add(ghost, { y: [{ to: dy * 0.2 - 90, duration: 280, ease: "outQuad" }, { to: dy, duration: 340, ease: "inQuad" }] }, 0)
    .add(ghost, { scale, opacity: [1, 0.85], duration: 620, ease: "inQuad" }, 0);
}

/**
 * Decoración de temporada: unos pocos íconos que caen despacio.
 * Pocos (≤ 12), detrás del contenido, se pausan con la pestaña oculta.
 */
export function initAmbient(layer: HTMLElement) {
  if (reduceMotion()) return () => {};
  const items = Array.from(layer.querySelectorAll<HTMLElement>("[data-ambient-item]"));
  const anims = items.map((el, i) => {
    const startX = utils.random(0, 100);
    el.style.left = `${startX}%`;
    return animate(el, {
      y: ["-10vh", "110vh"],
      x: [0, utils.random(-60, 60)],
      rotate: [utils.random(-30, 30), utils.random(-120, 120)],
      opacity: [{ to: 0.4, duration: 800 }, { to: 0.4, duration: 6000 }, { to: 0, duration: 1200 }],
      duration: utils.random(11000, 17000),
      delay: i * 1300,
      loop: true,
      ease: "linear",
    });
  });
  const onVis = () => anims.forEach((a) => (document.hidden ? a.pause() : a.play()));
  document.addEventListener("visibilitychange", onVis);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    anims.forEach((a) => a.revert());
  };
}

/** Entrada única del hero: titular y acciones suben con resorte. */
export function heroEntrance(root: HTMLElement) {
  if (reduceMotion()) return;
  const parts = root.querySelectorAll<HTMLElement>("[data-enter]");
  animate(parts, {
    y: [24, 0],
    opacity: [0, 1],
    ease: "outExpo",
    duration: 900,
    delay: stagger(90),
  });
}
