/**
 * Prepara una foto en el navegador antes de subirla: máximo 1600 px y WebP.
 * Así las fotos del celular de Luisa (5-10 MB) quedan en ~200-400 KB.
 */
export async function prepareImage(file: File, maxSide = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Ese archivo no es una foto.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la foto.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("No se pudo convertir la foto.");
  return { blob, width, height };
}

export async function uploadImage(file: File, folder: "productos" | "categorias" | "perritos") {
  const { blob, width, height } = await prepareImage(file);
  const form = new FormData();
  const type = blob.type || "image/webp";
  form.append("file", new File([blob], "foto.webp", { type }));
  form.append("folder", folder);
  const res = await fetch("/api/admin/uploads", { method: "POST", body: form, credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !data.key) throw new Error(data.error ?? "No se pudo subir la foto.");
  return { key: data.key, url: data.url!, width, height };
}
