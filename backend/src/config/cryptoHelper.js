// Criptografía AES-256-CBC (p. ej. password SMTP en BD)
import crypto from 'crypto';
import './env.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // Para AES, esto siempre es 16

function getKey() {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('SECRET_ENCRYPTION_KEY no está definida');
  }
  const key = Buffer.from(raw);
  if (key.length !== 32) {
    throw new Error(
      `SECRET_ENCRYPTION_KEY debe tener 32 bytes (actual: ${key.length}). Usa una cadena de 32 caracteres ASCII.`
    );
  }
  return key;
}

export function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  // Guardamos el IV junto con el texto porque lo necesitaremos para desencriptar
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
