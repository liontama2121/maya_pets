import { useState } from "react";
import { api } from "../../lib/admin-api";

/** Ocultar o volver a mostrar un producto. No borra: las ventas pasadas lo siguen necesitando. */
export default function ArchiveButton({ id, active }: { id: number; active: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/products/${id}/archive${active ? "" : "?restaurar=1"}`, { method: "POST" });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button type="button" className="btn btn-soft btn-sm" onClick={toggle} disabled={busy}>
        {active ? "Ocultar de la tienda" : "Mostrar en la tienda"}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
