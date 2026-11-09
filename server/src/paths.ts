// Caminhos de dados (sem efeitos colaterais: pode ser importado antes do banco abrir).
import { resolve } from 'node:path';

export const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
export const UPLOAD_DIR = resolve(DATA_DIR, 'uploads');
export const DB_PATH = resolve(DATA_DIR, process.env.DB_FILE ?? 'prospecta.db');
