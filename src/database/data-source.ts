/**
 * Database config for the TypeORM CLI (generating and running migrations). The app
 * itself connects through TypeOrmModule in app.module.ts with the same settings.
 *
 *   npm run build && npm run migration:generate -- src/database/migrations/AddSomething
 *   npm run migration:run
 */
import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

export const MIGRATIONS_GLOB = join(import.meta.dirname, 'migrations', '*.js');

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [join(import.meta.dirname, '..', '**', '*.entity.js')],
  migrations: [MIGRATIONS_GLOB],
});
