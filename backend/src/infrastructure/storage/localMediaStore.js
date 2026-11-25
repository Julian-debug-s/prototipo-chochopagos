import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve, basename } from 'node:path';

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SAFE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Guarda fotos en disco con nombres aleatorios (nunca el nombre que manda el usuario).
 * En producción se reemplazaría por S3 / Cloud Storage implementando la misma interfaz.
 */
export function createLocalMediaStore({ dir }) {
  const root = resolve(dir);

  const pathFor = (name) => {
    const clean = basename(String(name));
    return SAFE_NAME.test(clean) ? join(root, clean) : null;
  };

  return {
    isAllowedType: (mimeType) => Boolean(EXTENSIONS[mimeType]),

    /** @returns {Promise<string>} nombre del archivo guardado */
    async save(buffer, mimeType) {
      const ext = EXTENSIONS[mimeType];
      if (!ext) throw new Error(`Tipo de imagen no permitido: ${mimeType}`);
      await mkdir(root, { recursive: true });
      const name = `${randomUUID()}.${ext}`;
      await writeFile(join(root, name), buffer, { mode: 0o600 });
      return name;
    },

    async read(name) {
      const path = pathFor(name);
      if (!path) throw new Error('Nombre de archivo no válido');
      return readFile(path);
    },

    /** Ruta absoluta segura para servir un archivo, o null si el nombre no es válido. */
    resolve: pathFor,
  };
}
