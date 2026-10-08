import { mediaUrl, type StorageDriver } from "./driver";

export function r2Driver(bucket: R2Bucket): StorageDriver {
  return {
    async put(key, data, contentType) {
      await bucket.put(key, data, {
        httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return {
        body: obj.body,
        contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
        size: obj.size,
        etag: obj.httpEtag,
      };
    },
    async delete(key) {
      await bucket.delete(key);
    },
    url(key) {
      return mediaUrl(key)!;
    },
  };
}
