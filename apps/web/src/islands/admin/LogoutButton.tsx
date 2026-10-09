import { SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      window.location.href = "/admin/login";
    }
  };
  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:underline disabled:opacity-60"
    >
      <SignOut size={18} aria-hidden="true" /> {busy ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
