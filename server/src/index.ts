// Ponto de entrada: restaura o banco (se houver armazenamento remoto) antes de abri-lo.
import { restoreDatabase } from './persist.ts';

await restoreDatabase();
await import('./app.ts');
