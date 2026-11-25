// Borra la base de datos local (y sus archivos WAL) para reiniciar la demo.
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.env.DATABASE_PATH ?? './data/chochopagos.db');
for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
console.log(`Base de datos eliminada: ${path}. Se recreará con datos demo al iniciar.`);
