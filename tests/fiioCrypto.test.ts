import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  aes256EcbDecrypt,
  aes256EcbEncrypt,
  decryptFiioBrowserData,
  encryptFiioBrowserPayload,
} from '../src/core/fiioCrypto';

describe('Browser-native FiiO RSA + AES-256-ECB crypto', () => {
  it('matches Node.js crypto aes-256-ecb output bit-for-bit', () => {
    const keyHex = '0123456789abcdef0123456789abcdef';
    const keyBuf = Buffer.from(keyHex, 'utf8');
    const plain = JSON.stringify({ searchValue: 'podcast', deviceType: 109, note: 'Tiếng Việt UTF-8 🎧' });

    const nodeCipher = crypto.createCipheriv('aes-256-ecb', keyBuf, null);
    const expectedB64 = Buffer.concat([nodeCipher.update(plain, 'utf8'), nodeCipher.final()]).toString('base64');

    const browserEncrypted = aes256EcbEncrypt(new TextEncoder().encode(plain), new TextEncoder().encode(keyHex));
    expect(Buffer.from(browserEncrypted).toString('base64')).toBe(expectedB64);

    const browserDecrypted = new TextDecoder().decode(
      aes256EcbDecrypt(new Uint8Array(Buffer.from(expectedB64, 'base64')), new TextEncoder().encode(keyHex)),
    );
    expect(browserDecrypted).toBe(plain);
  });

  it('produces valid FiiO envelope and decrypts simulated server payload', () => {
    const { keyHex, requestId, envelopeJson } = encryptFiioBrowserPayload('{"deviceType":[109],"pageNumber":1}');
    const env = JSON.parse(envelopeJson);
    expect(keyHex).toHaveLength(32);
    expect(requestId.length).toBeGreaterThan(8);
    expect(Buffer.from(env.cipherSign, 'base64').length).toBe(256); // 2048-bit RSA block

    const serverRespObj = { totalRow: 814, records: [{ styleName: 'JD1 + JA11 | Podcast & Speech' }] };
    const nodeCipher = crypto.createCipheriv('aes-256-ecb', Buffer.from(keyHex, 'utf8'), null);
    const serverEncB64 = Buffer.concat([
      nodeCipher.update(JSON.stringify(serverRespObj), 'utf8'),
      nodeCipher.final(),
    ]).toString('base64');

    expect(decryptFiioBrowserData(keyHex, serverEncB64)).toEqual(serverRespObj);
  });
});
