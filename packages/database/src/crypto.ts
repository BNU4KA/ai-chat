import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type Keyring = {
  currentId: string;
  keys: Map<string, Buffer>;
};

export type Sealed = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  encryptionKeyVersion: string;
};

export function loadKeyring(raw: string | undefined): Keyring {
  const keys = new Map<string, Buffer>();
  for (const part of (raw ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const splitAt = part.indexOf(':');
    const id = splitAt === -1 ? '' : part.slice(0, splitAt);
    const material = splitAt === -1 ? '' : part.slice(splitAt + 1);
    if (!id || !material) {
      throw new Error('ENCRYPTION_KEYS entries must look like v1:<base64url>');
    }
    const bytes = Buffer.from(material, 'base64url');
    if (bytes.length !== 32) {
      throw new Error(`Encryption key ${id} must decode to 32 bytes`);
    }
    keys.set(id, bytes);
  }
  const currentId = [...keys.keys()].at(-1);
  if (!currentId) {
    throw new Error('ENCRYPTION_KEYS is required');
  }
  return { currentId, keys };
}

export function seal(keyring: Keyring, plaintext: string, aad: string): Sealed {
  const nonce = randomBytes(12);
  const key = keyring.keys.get(keyring.currentId);
  if (!key) throw new Error('Current encryption key is missing');
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext,
    nonce,
    authTag: cipher.getAuthTag(),
    encryptionKeyVersion: keyring.currentId,
  };
}

export function open(keyring: Keyring, sealed: Sealed, aad: string): string {
  const key = keyring.keys.get(sealed.encryptionKeyVersion);
  if (!key) throw new Error('Encryption key version is not available');
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(sealed.authTag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
}

export function credentialAad(ownerId: string, provider: string, version: number): string {
  return `${ownerId}|${provider}|${version}`;
}

export function lastFour(secret: string): string {
  return secret.slice(-4);
}
