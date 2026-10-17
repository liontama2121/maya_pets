import { ArrowsOut } from "@phosphor-icons/react/dist/csr/ArrowsOut";
import { Image as ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { useEffect, useId, useRef, useState } from "react";
import { uploadBlob } from "../../lib/image";

export interface ImageValue {
  src: string;
  alt: string;
}

const MAX_SIDE = 1600;
const ASPECTS = [
  { label: "Original", value: 0 },
  { label: "Cuadrada", value: 1 },
  { label: "Vertical 4:5", value: 4 / 5 },
  { label: "Horizontal 16:9", value: 16 / 9 },
] as const;

/**
 * Imagen de un bloque de contenido: subir con recorte (el navegador la reduce a WebP de máx. 1600 px),
 * elegir una ilustración de la marca o quitarla. El texto alternativo describe la imagen a quien no la ve.
 */
export function ImageField({
  label,
  value,
  onChange,
  presets = [],
  hint,
  error,
  decorative = false,
}: {
  label: string;
  value: ImageValue;
  onChange: (v: ImageValue) => void;
  presets?: { src: string; alt: string; label: string }[];
  hint?: string;
  error?: string;
  /** Si la imagen es decorativa, no se pide texto alternativo. */
  decorative?: boolean;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <fieldset className="rounded-2xl bg-ground p-4">
      <legend className="sr-only">{label}</legend>
      <p className="label !mb-2" aria-hidden="true">{label}</p>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-[inset_0_0_0_1.5px_var(--color-line)]">
          {value.src ? (
            <img src={value.src} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImageIcon size={32} className="text-ink-soft" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <UploadSimple size={18} aria-hidden="true" />
              {busy ? "Subiendo…" : value.src ? "Cambiar imagen" : "Subir imagen"}
            </button>
            {presets.map((p) => (
              <button
                key={p.src}
                type="button"
                className="chip"
                aria-pressed={value.src === p.src}
                onClick={() => onChange({ src: p.src, alt: decorative ? "" : p.alt })}
              >
                {p.label}
              </button>
            ))}
            {value.src && (
              <button type="button" className="chip" onClick={() => onChange({ src: "", alt: "" })}>
                Quitar
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label={`Subir ${label.toLowerCase()}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) {
                setProblem(null);
                setFile(f);
              }
            }}
          />
          {!decorative && value.src && (
            <div>
              <label className="sr-only" htmlFor={`${id}-alt`}>Descripción de la imagen</label>
              <input
                id={`${id}-alt`}
                className="field"
                maxLength={160}
                value={value.alt}
                onChange={(e) => onChange({ ...value, alt: e.target.value })}
                placeholder="Describe la imagen (para quien no la ve)"
              />
            </div>
          )}
          {hint && <p className="hint !mt-0">{hint}</p>}
          {(problem || error) && <p className="error-text" role="alert">{problem ?? error}</p>}
        </div>
      </div>

      {file && (
        <Cropper
          file={file}
          onCancel={() => setFile(null)}
          onDone={async (blob) => {
            setFile(null);
            setBusy(true);
            try {
              const up = await uploadBlob(blob, "contenido");
              // Imagen nueva: la descripción anterior ya no aplica.
              onChange({ src: up.url, alt: "" });
            } catch (err) {
              setProblem(err instanceof Error ? err.message : "No se pudo subir la imagen.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </fieldset>
  );
}

/** Recorte simple: arrastra para encuadrar y usa el control de zoom. Respeta la transparencia (WebP). */
function Cropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (b: Blob) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<{ el: HTMLImageElement; url: string } | null>(null);
  const [aspect, setAspect] = useState<number>(0);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg({ el, url });
    el.onerror = () => setError("No pudimos abrir esa imagen. Prueba con otra en JPG o PNG.");
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const ratio = img ? aspect || img.el.naturalWidth / img.el.naturalHeight : 1;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img, ratio]);

  // Geometría: la imagen cubre el recuadro (cover) multiplicada por el zoom; pos = centro relativo (0..1).
  const geo = (() => {
    if (!img || !box.w) return null;
    const nw = img.el.naturalWidth;
    const nh = img.el.naturalHeight;
    const scale = Math.max(box.w / nw, box.h / nh) * zoom;
    const dw = nw * scale;
    const dh = nh * scale;
    const x = Math.min(0, Math.max(box.w - dw, box.w / 2 - pos.x * dw));
    const y = Math.min(0, Math.max(box.h - dh, box.h / 2 - pos.y * dh));
    return { scale, dw, dh, x, y, nw, nh };
  })();

  /** El centro solo puede moverse hasta donde la imagen sigue cubriendo el recuadro. */
  const fit = (x: number, y: number) => {
    if (!geo) return { x, y };
    const hx = box.w / 2 / geo.dw;
    const hy = box.h / 2 / geo.dh;
    return { x: Math.min(1 - hx, Math.max(hx, x)), y: Math.min(1 - hy, Math.max(hy, y)) };
  };

  const nudge = (dx: number, dy: number) => {
    if (!geo) return;
    setPos((p) => fit(p.x + dx / geo.dw, p.y + dy / geo.dh));
  };

  const finish = async () => {
    if (!geo || !img) return;
    const sx = -geo.x / geo.scale;
    const sy = -geo.y / geo.scale;
    const sw = box.w / geo.scale;
    const sh = box.h / geo.scale;
    const out = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * out);
    canvas.height = Math.round(sh * out);
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError("Tu navegador no pudo procesar la imagen.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.el, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
    if (!blob) return setError("No se pudo convertir la imagen.");
    onDone(blob);
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-[var(--radius-toy)] bg-white p-0 backdrop:bg-teal-950/60"
      aria-labelledby="crop-title"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <h2 id="crop-title" className="text-xl font-semibold">Encuadra la imagen</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Forma del recorte">
          {ASPECTS.map((a) => (
            <button
              key={a.label}
              type="button"
              className="chip"
              aria-pressed={aspect === a.value}
              onClick={() => {
                setAspect(a.value);
                setZoom(1);
                setPos({ x: 0.5, y: 0.5 });
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="error-text" role="alert">{error}</p>
        ) : (
          <div className="grid place-items-center rounded-2xl bg-[repeating-conic-gradient(var(--color-ground-2)_0_25%,#fff_0_50%)] bg-[length:20px_20px] p-2">
            <div
              ref={boxRef}
              tabIndex={0}
              role="application"
              aria-label="Área de recorte. Arrastra o usa las flechas para mover la imagen."
              className="relative w-full cursor-grab touch-none overflow-hidden rounded-xl outline-offset-2 active:cursor-grabbing"
              style={{ aspectRatio: String(ratio), maxHeight: "55vh", maxWidth: `calc(55vh * ${ratio})` }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const start = fit(pos.x, pos.y);
                drag.current = { px: e.clientX, py: e.clientY, x: start.x, y: start.y };
              }}
              onPointerMove={(e) => {
                if (!drag.current || !geo) return;
                const d = drag.current;
                setPos(fit(d.x - (e.clientX - d.px) / geo.dw, d.y - (e.clientY - d.py) / geo.dh));
              }}
              onPointerUp={() => (drag.current = null)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 40 : 10;
                const map: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0],
                  ArrowRight: [step, 0],
                  ArrowUp: [0, -step],
                  ArrowDown: [0, step],
                };
                const m = map[e.key];
                if (m) {
                  e.preventDefault();
                  nudge(m[0], m[1]);
                }
              }}
            >
              {img && geo && (
                <img
                  src={img.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                  style={{ width: geo.dw, height: geo.dh, transform: `translate(${geo.x}px, ${geo.y}px)` }}
                />
              )}
            </div>
          </div>
        )}

        <label className="flex items-center gap-3">
          <ArrowsOut size={20} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <span className="sr-only">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-teal-700"
          />
        </label>
        <p className="hint !mt-0">Se guarda en WebP de máximo {MAX_SIDE} px. Las ilustraciones con fondo transparente lo conservan.</p>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-soft" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-teal" onClick={finish} disabled={!geo}>Usar esta imagen</button>
        </div>
      </div>
    </dialog>
  );
}
