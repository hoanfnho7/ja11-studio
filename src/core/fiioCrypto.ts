/**
 * Pure TypeScript, zero-dependency RSA-PKCS1-v1.5 (2048-bit via BigInt) + AES-256-ECB (FIPS-197)
 * matching FiiO's `fiiocontrol.fiio.com/ucenter-api/*` envelope encryption directly in the browser.
 * Enables live FiiO Hand-Picked search & browsing straight from static GitHub Pages without a backend!
 */

// Extracted from official FiiO RSA-2048 X.509 SPKI public key (e = 65537)
const FIIO_RSA_PUB_DER_B64 =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0mPGrgZPDCPDd9m129qy' +
  '+TV5HeLWDTJbNK5wlUAemqH3NyrOh3HUo+LbTbMf6J45AFDjNRCDiZZc3Y+uCici' +
  '9fHn0dixbtuHOdJer0U/4xHloOgYmsTwhAh56njWQAyaqoi0R3nG0bpCgsi5omlS' +
  'RqP5KyaybuKjPyZvGVn0IKnVVQx3AI1+p/5lWARv23nPNS9ehfKts5oeFdOAKgT2' +
  'mvV80TzJHbc2mKU8XoBr0VgX4Ohgq/A+Ddv0Wz0bNAQJgzrFAN1lIg2NqktcGdzD' +
  '/HHPIeGCYG2gB7ZADsGX6vGpSoeUj3anr25nojQVbZgEBeE/6nJZ793Qhq8vudep' +
  'XQIDAQAB';

// --- Base64 & Byte Helpers ---
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = '0x';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return BigInt(hex);
}

function bigIntToBytes(val: bigint, byteLen: number): Uint8Array {
  const hex = val.toString(16).padStart(byteLen * 2, '0');
  const out = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/**
 * Extracts RSA modulus `n` (256 bytes) and public exponent `e` (65537) from the DER SPKI key.
 */
function parseSpkiRsaKey(der: Uint8Array): { n: bigint; e: bigint; keySize: number } {
  // Standard 2048-bit RSA SPKI DER: 294 bytes total; modulus integer starts after BIT STRING + SEQUENCE header
  let pos = 0;
  const readLen = () => {
    const b = der[pos++];
    if ((b & 0x80) === 0) return b;
    const num = b & 0x7f;
    let len = 0;
    for (let i = 0; i < num; i++) len = (len << 8) | der[pos++];
    return len;
  };
  // Outer SEQUENCE
  pos++;
  readLen();
  // AlgorithmIdentifier SEQUENCE -> skip
  pos++;
  const algLen = readLen();
  pos += algLen;
  // BIT STRING
  pos++;
  readLen();
  pos++; // unused bits = 0x00
  // Inner RSAPublicKey SEQUENCE
  pos++;
  readLen();
  // Modulus INTEGER
  pos++;
  let nLen = readLen();
  let nStart = pos;
  pos += nLen;
  if (der[nStart] === 0x00) {
    nStart++;
    nLen--;
  }
  const nBytes = der.subarray(nStart, nStart + nLen);
  // Exponent INTEGER
  pos++;
  const eLen = readLen();
  const eBytes = der.subarray(pos, pos + eLen);
  return { n: bytesToBigInt(nBytes), e: bytesToBigInt(eBytes), keySize: nLen };
}

let cachedRsaKey: { n: bigint; e: bigint; keySize: number } | null = null;
function getFiioRsaKey() {
  if (!cachedRsaKey) {
    cachedRsaKey = parseSpkiRsaKey(base64ToBytes(FIIO_RSA_PUB_DER_B64));
  }
  return cachedRsaKey;
}

export function rsaPkcs1v15Encrypt(data: Uint8Array): Uint8Array {
  const { n, e, keySize } = getFiioRsaKey();
  const psLen = keySize - data.length - 3;
  if (psLen < 8) throw new Error('RSA payload too large');
  const em = new Uint8Array(keySize);
  em[0] = 0x00;
  em[1] = 0x02;
  // Fill non-zero random padding bytes
  const rnd = new Uint8Array(psLen * 2);
  crypto.getRandomValues(rnd);
  let rIdx = 0;
  for (let i = 0; i < psLen; i++) {
    let b = 0;
    while (b === 0) {
      if (rIdx >= rnd.length) {
        crypto.getRandomValues(rnd);
        rIdx = 0;
      }
      b = rnd[rIdx++];
    }
    em[2 + i] = b;
  }
  em[2 + psLen] = 0x00;
  em.set(data, 3 + psLen);
  const c = modPow(bytesToBigInt(em), e, n);
  return bigIntToBytes(c, keySize);
}

// --- Standard FIPS-197 AES-256-ECB (14 rounds) ---
const SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);

const INV_SBOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];

function xtime(a: number): number {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
}

function gmul(a: number, b: number): number {
  let p = 0;
  let aa = a;
  let bb = b;
  for (let i = 0; i < 8; i++) {
    if (bb & 1) p ^= aa;
    const hi = aa & 0x80;
    aa = (aa << 1) & 0xff;
    if (hi) aa ^= 0x1b;
    bb >>= 1;
  }
  return p;
}

function expandKey256(key: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error('AES-256 key must be 32 bytes');
  const w = new Uint8Array(240); // 15 round keys * 16 bytes
  w.set(key, 0);
  let bytesGen = 32;
  let rconIdx = 0;
  const temp = new Uint8Array(4);
  while (bytesGen < 240) {
    temp[0] = w[bytesGen - 4];
    temp[1] = w[bytesGen - 3];
    temp[2] = w[bytesGen - 2];
    temp[3] = w[bytesGen - 1];
    if (bytesGen % 32 === 0) {
      const t = temp[0];
      temp[0] = SBOX[temp[1]] ^ RCON[rconIdx++];
      temp[1] = SBOX[temp[2]];
      temp[2] = SBOX[temp[3]];
      temp[3] = SBOX[t];
    } else if (bytesGen % 32 === 16) {
      temp[0] = SBOX[temp[0]];
      temp[1] = SBOX[temp[1]];
      temp[2] = SBOX[temp[2]];
      temp[3] = SBOX[temp[3]];
    }
    for (let i = 0; i < 4; i++) {
      w[bytesGen] = w[bytesGen - 32] ^ temp[i];
      bytesGen++;
    }
  }
  return w;
}

function addRoundKey(s: Uint8Array, rk: Uint8Array, round: number) {
  const off = round * 16;
  for (let i = 0; i < 16; i++) s[i] ^= rk[off + i];
}

function aes256EncryptBlock(input: Uint8Array, inOff: number, rk: Uint8Array, out: Uint8Array, outOff: number) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = input[inOff + i];
  addRoundKey(s, rk, 0);

  for (let r = 1; r <= 14; r++) {
    // SubBytes
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    // ShiftRows (column-major state)
    let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
    // MixColumns (except final round)
    if (r < 14) {
      for (let c = 0; c < 4; c++) {
        const i = c * 4;
        const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
        const xor = a0 ^ a1 ^ a2 ^ a3;
        s[i] ^= xor ^ xtime(a0 ^ a1);
        s[i + 1] ^= xor ^ xtime(a1 ^ a2);
        s[i + 2] ^= xor ^ xtime(a2 ^ a3);
        s[i + 3] ^= xor ^ xtime(a3 ^ a0);
      }
    }
    addRoundKey(s, rk, r);
  }
  out.set(s, outOff);
}

function aes256DecryptBlock(input: Uint8Array, inOff: number, rk: Uint8Array, out: Uint8Array, outOff: number) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = input[inOff + i];
  addRoundKey(s, rk, 14);

  for (let r = 13; r >= 0; r--) {
    // InvShiftRows
    let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
    // InvSubBytes
    for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
    addRoundKey(s, rk, r);
    // InvMixColumns (except round 0)
    if (r > 0) {
      for (let c = 0; c < 4; c++) {
        const i = c * 4;
        const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
        s[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
        s[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
        s[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
        s[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
      }
    }
  }
  out.set(s, outOff);
}

export function aes256EcbEncrypt(plain: Uint8Array, key: Uint8Array): Uint8Array {
  const rk = expandKey256(key);
  const padLen = 16 - (plain.length % 16);
  const padded = new Uint8Array(plain.length + padLen);
  padded.set(plain, 0);
  padded.fill(padLen, plain.length);
  const out = new Uint8Array(padded.length);
  for (let off = 0; off < padded.length; off += 16) {
    aes256EncryptBlock(padded, off, rk, out, off);
  }
  return out;
}

export function aes256EcbDecrypt(cipher: Uint8Array, key: Uint8Array): Uint8Array {
  if (cipher.length === 0 || cipher.length % 16 !== 0) {
    throw new Error('Invalid AES-256-ECB ciphertext length');
  }
  const rk = expandKey256(key);
  const out = new Uint8Array(cipher.length);
  for (let off = 0; off < cipher.length; off += 16) {
    aes256DecryptBlock(cipher, off, rk, out, off);
  }
  const padLen = out[out.length - 1];
  if (padLen < 1 || padLen > 16) {
    throw new Error('Invalid PKCS#7 padding');
  }
  return out.subarray(0, out.length - padLen);
}

export function encryptFiioBrowserPayload(plainJsonStr: string): {
  keyHex: string;
  requestId: string;
  envelopeJson: string;
} {
  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  let keyHex = '';
  for (let i = 0; i < rnd.length; i++) keyHex += rnd[i].toString(16).padStart(2, '0');

  const enc = new TextEncoder();
  const keyBytes = enc.encode(keyHex); // 32 ASCII bytes
  const cipherText = bytesToBase64(aes256EcbEncrypt(enc.encode(plainJsonStr), keyBytes));
  const cipherSign = bytesToBase64(rsaPkcs1v15Encrypt(keyBytes));
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    keyHex,
    requestId,
    envelopeJson: JSON.stringify({ cipherSign, cipherText }),
  };
}

export function decryptFiioBrowserData(keyHex: string, base64Data: string): unknown {
  const keyBytes = new TextEncoder().encode(keyHex);
  const decrypted = aes256EcbDecrypt(base64ToBytes(base64Data), keyBytes);
  return JSON.parse(new TextDecoder().decode(decrypted));
}
