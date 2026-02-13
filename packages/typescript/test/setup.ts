// Polyfill globalThis.crypto for Node 18 (Web Crypto API global added in Node 19)
// Required for Workers exporter tests that use crypto.getRandomValues()
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}
