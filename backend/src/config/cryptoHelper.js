//Cryptografia
import crypto from 'crypto';
import './env.js';

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.SECRET_ENCRYPTION_KEY); // La llave de 32 chars
const IV_LENGTH = 16; // Para AES, esto siempre es 16

export function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Guardamos el IV junto con el texto porque lo necesitaremos para desencriptar
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}