/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<import("@maya/api").Bindings>;

declare namespace App {
  interface Locals extends Runtime {
    staff?: import("@maya/api").StaffIdentity;
  }
}
