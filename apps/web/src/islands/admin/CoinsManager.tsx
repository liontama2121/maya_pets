import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Printer } from "@phosphor-icons/react/dist/csr/Printer";
import { WhatsappLogo } from "@phosphor-icons/react/dist/csr/WhatsappLogo";
import { useCallback, useEffect, useId, useState } from "react";
import { api, ApiError } from "../../lib/admin-api";
import { formatCOP } from "../../lib/format";

interface CoinRow {
  id: number;
  code: string;
  ticket: number;
  purchase_amount: number;
  sale_ref: string;
  issued_by: string;
  issued_at: string;
  expires_at: string;
  attempts_used: number;
  attempts_total: number;
  player_name: string | null;
  voided: number;
  void_reason: string;
  best: number | null;
  rejected: number;
}

interface Issued {
  id: number;
  code: string;
  ticket: number;
  expires_at: string;
  attempts_total: number;
}

const toInt = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

export default function CoinsManager({
  minPurchase,
  isAdmin,
  month,
  siteUrl,
}: {
  minPurchase: number;
  isAdmin: boolean;
  month: string;
  siteUrl: string;
}) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CoinRow[] | null>(null);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const [voiding, setVoiding] = useState<{ id: number; reason: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<CoinRow[]>(`/promo/coins?mes=${month}${q ? `&q=${encodeURIComponent(q)}` : ""}`));
    } catch {
      setRows([]);
    }
  }, [month, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCopied(false);
    const value = toInt(amount);
    if (value < minPurchase) {
      setError(`La compra debe ser de al menos ${formatCOP(minPurchase)} para dar COIN.`);
      return;
    }
    setBusy(true);
    try {
      const coin = await api<Issued>("/promo/coins", { method: "POST", json: { purchaseAmount: value, saleRef: ref } });
      setIssued(coin);
      setAmount("");
      setRef("");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo entregar el COIN.");
    } finally {
      setBusy(false);
    }
  };

  const link = issued ? `${siteUrl}/juega?codigo=${issued.code}` : "";
  const message = issued
    ? `¡Gracias por tu compra en MAYA Pets! Tu COIN es ${issued.code}: ${issued.attempts_total} intentos en el juego del mes y la boleta #${issued.ticket} para la rifa. Juega aquí: ${link}`
    : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued!.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const voidCoin = async () => {
    if (!voiding) return;
    try {
      await api(`/promo/coins/${voiding.id}/anular`, { method: "POST", json: { reason: voiding.reason } });
      setVoiding(null);
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo anular.");
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-4 xl:sticky xl:top-8 xl:self-start">
        <form onSubmit={issue} className="rounded-[var(--radius-toy)] bg-white p-5" noValidate>
          <h2 className="text-xl font-semibold">Entregar COIN</h2>
          <p className="mt-1 text-ink-soft">Para compras desde {formatCOP(minPurchase)}.</p>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor={`${id}-a`} className="label">
                Valor de la compra
              </label>
              <input
                id={`${id}-a`}
                className="field tnum text-lg"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="85000"
                aria-invalid={error ? true : undefined}
              />
              {toInt(amount) > 0 && <p className="hint tnum">{formatCOP(toInt(amount))}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-r`} className="label">
                Factura o referencia <span className="font-normal text-ink-soft">(opcional)</span>
              </label>
              <input id={`${id}-r`} className="field" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
            </div>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-sun mt-5 w-full text-lg" disabled={busy}>
            {busy ? "Generando…" : "Generar COIN"}
          </button>
        </form>

        {issued && (
          <section className="coin-ticket on-field rounded-[var(--radius-toy)] bg-teal-700 p-5 text-white shadow-[inset_0_-5px_0_var(--color-teal-900)]" aria-live="polite">
            <p className="text-white/85">COIN para el cliente</p>
            <p className="tnum mt-1 select-all text-3xl font-bold tracking-wider text-sun-400">{issued.code}</p>
            <p className="mt-2 text-white/90">
              {issued.attempts_total} intentos · boleta <span className="tnum font-semibold">#{issued.ticket}</span> · vence {fmtDate(issued.expires_at)}
            </p>
            <p className="mt-1 text-sm text-white/80">Juega en {siteUrl.replace(/^https?:\/\//, "")}/juega</p>
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-sun btn-sm" onClick={copy}>
                <Copy size={18} aria-hidden="true" /> {copied ? "Copiado" : "Copiar"}
              </button>
              <a className="btn btn-ghost-light btn-sm" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener">
                <WhatsappLogo size={18} weight="fill" aria-hidden="true" /> Enviar
              </a>
              <button type="button" className="btn btn-ghost-light btn-sm" onClick={() => window.print()}>
                <Printer size={18} aria-hidden="true" /> Imprimir
              </button>
            </div>
          </section>
        )}
      </div>

      <section className="min-w-0" aria-labelledby={`${id}-list`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${id}-list`} className="text-xl font-semibold">
            COIN de este mes
          </h2>
          <div className="relative w-full sm:w-72">
            <label htmlFor={`${id}-q`} className="sr-only">
              Buscar COIN
            </label>
            <MagnifyingGlass size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <input id={`${id}-q`} className="field !rounded-full pl-11" placeholder="Código, apodo o factura" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {rows === null ? (
          <div className="mt-4 space-y-2" aria-label="Cargando">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-toy)] bg-white p-6 text-ink-soft">{q ? "Nada coincide con esa búsqueda." : "Todavía no se han entregado COIN este mes."}</p>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-[var(--radius-toy)] bg-white">
            {rows.map((r) => (
              <li key={r.id} className={`border-b border-line px-4 py-3 last:border-0 ${r.voided ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tnum font-semibold tracking-wide">
                      {r.code} <span className="font-normal text-ink-soft">· boleta #{r.ticket}</span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {formatCOP(r.purchase_amount)}
                      {r.sale_ref ? ` · ${r.sale_ref}` : ""} · {fmtDate(r.issued_at)}
                      {r.voided ? ` · Anulado: ${r.void_reason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="rounded-full bg-ground px-3 py-1">{r.player_name ?? "Sin registrar"}</span>
                    <span className="tnum rounded-full bg-teal-50 px-3 py-1 text-teal-900">
                      {r.attempts_used}/{r.attempts_total} intentos
                    </span>
                    <span className="tnum rounded-full bg-sun-100 px-3 py-1 font-semibold text-teal-900">{r.best ?? "-"} pts</span>
                    {r.rejected > 0 && <span className="rounded-full bg-danger-soft px-3 py-1 font-medium text-danger">{r.rejected} rechazada</span>}
                    {isAdmin && !r.voided && (
                      <button type="button" className="font-medium text-danger underline" onClick={() => setVoiding({ id: r.id, reason: "" })}>
                        Anular
                      </button>
                    )}
                  </div>
                </div>
                {voiding?.id === r.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-danger-soft p-3">
                    <div className="min-w-[220px] flex-1">
                      <label htmlFor={`${id}-v-${r.id}`} className="label text-sm">
                        Motivo para anular
                      </label>
                      <input
                        id={`${id}-v-${r.id}`}
                        className="field"
                        value={voiding.reason}
                        onChange={(e) => setVoiding({ id: r.id, reason: e.target.value })}
                        placeholder="Ej.: compra devuelta"
                      />
                    </div>
                    <button type="button" className="btn btn-danger btn-sm" onClick={voidCoin} disabled={voiding.reason.trim().length < 3}>
                      Anular COIN
                    </button>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setVoiding(null)}>
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
