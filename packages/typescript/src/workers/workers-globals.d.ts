/**
 * Minimal ambient declarations for Cloudflare Workers globals used by the
 * workers exporter.  These avoid pulling in the full @cloudflare/workers-types
 * package while satisfying the TypeScript compiler.
 */

/* eslint-disable no-var */

declare function fetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response>;

declare var crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: SubtleCrypto;
};
