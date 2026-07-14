(function (root) {
  const DEFAULT_ITERATIONS = 210000;

  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }

  function randomBase64(length = 16) {
    return bytesToBase64(crypto.getRandomValues(new Uint8Array(length)));
  }

  async function deriveVerifier(secret, salt, iterations = DEFAULT_ITERATIONS) {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(salt),
      iterations
    }, material, 256);
    return bytesToBase64(new Uint8Array(bits));
  }

  async function createCredential(secret) {
    const salt = randomBase64(16);
    return {
      algorithm: 'PBKDF2-SHA256',
      iterations: DEFAULT_ITERATIONS,
      salt,
      verifier: await deriveVerifier(secret, salt, DEFAULT_ITERATIONS)
    };
  }

  async function verifyCredential(secret, credential) {
    if (!secret || !credential?.salt || !credential?.verifier) return false;
    const actual = await deriveVerifier(secret, credential.salt, credential.iterations || DEFAULT_ITERATIONS);
    if (actual.length !== credential.verifier.length) return false;
    let different = 0;
    for (let i = 0; i < actual.length; i++) different |= actual.charCodeAt(i) ^ credential.verifier.charCodeAt(i);
    return different === 0;
  }

  async function sha256Hex(text) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function generateRecoveryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    let value = '';
    for (let i = 0; i < bytes.length; i++) {
      value += alphabet[bytes[i] % alphabet.length];
      if ((i + 1) % 4 === 0 && i < bytes.length - 1) value += '-';
    }
    return `PL-${value}`;
  }

  root.PLcrypto = {
    DEFAULT_ITERATIONS,
    createCredential,
    verifyCredential,
    sha256Hex,
    generateRecoveryCode
  };
})(globalThis);
