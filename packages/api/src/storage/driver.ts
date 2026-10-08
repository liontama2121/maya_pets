/**
 * Interfaz de almacenamiento de archivos. Hoy: R2 (local emulado por wrangler).
 * Migrar a S3 u otro proveedor = implementar esta interfaz.
 */
export interface StoredObject {
  body: ReadableStream;
  contentType: string;
  size: number;
  etag: string;
}

export interface StorageDriver {
  put(key: string, data: ArrayBuffer | ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** URL pública relativa con la que el sitio sirve el archivo. */
  url(key: string): string;
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/media/${key}` : null;
}
