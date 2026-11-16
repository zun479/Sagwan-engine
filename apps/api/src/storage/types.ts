// 파일 저장소 어댑터. Cloudflare R2 바인딩, S3 호환(NCP 등), 메모리(테스트) 구현을 둔다.

export interface StoredObject {
  body: ArrayBuffer;
  contentType: string;
}

export interface StorageAdapter {
  put(key: string, body: ArrayBuffer | Uint8Array | string, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export function memoryStorage(): StorageAdapter & { keys(): string[] } {
  const m = new Map<string, StoredObject>();
  return {
    keys: () => [...m.keys()],
    async put(key, body, contentType) {
      const buf = typeof body === 'string' ? new TextEncoder().encode(body) : body instanceof Uint8Array ? body : new Uint8Array(body);
      m.set(key, { body: buf.slice().buffer, contentType });
    },
    async get(key) {
      return m.get(key) ?? null;
    },
    async delete(key) {
      m.delete(key);
    },
  };
}

// R2 바인딩 중 쓰는 부분만 선언
export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

export function r2Storage(bucket: R2Bucket): StorageAdapter {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async get(key) {
      const o = await bucket.get(key);
      if (!o) return null;
      return { body: await o.arrayBuffer(), contentType: o.httpMetadata?.contentType ?? 'application/octet-stream' };
    },
    delete: (key) => bucket.delete(key),
  };
}
