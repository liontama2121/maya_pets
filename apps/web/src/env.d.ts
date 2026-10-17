/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<import("@maya/api").Bindings>;

declare namespace App {
  interface Locals extends Runtime {
    staff?: import("@maya/api").StaffIdentity;
    /** Vista previa de borradores de "Contenido del sitio" (?borrador=1 con sesión de editor). */
    contentDraft?: boolean;
  }
}
