// The app's tsconfig has no Node types; the model tests build their ZIP fixtures with Node's zlib, so declare only
// the three functions they use. Never imported by the app itself.
declare module 'node:zlib' {
  export function deflateRawSync(data: Uint8Array): Uint8Array;
  export function inflateRawSync(data: Uint8Array): Uint8Array;
  export function crc32(data: Uint8Array | string, value?: number): number;
}
