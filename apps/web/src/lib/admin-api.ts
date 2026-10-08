/** Cliente del panel. Mismo origen: Cloudflare Access firma cada petición. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string[] | undefined> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Sin conexión. Revisa el internet e intenta de nuevo.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string[]> };
  if (!res.ok) throw new ApiError(data.error ?? "No se pudo guardar. Intenta de nuevo.", res.status, data.fields ?? {});
  return data as T;
}
