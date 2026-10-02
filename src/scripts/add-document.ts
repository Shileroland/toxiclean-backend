/**
 * Issues a document (certificate, invoice, …) to a customer until the admin exists:
 *
 *   npm run documents:add -- --email ada@example.com --type invoice \
 *     --title "Fumigation Service Invoice" --reference TX-BK-000001 \
 *     --issued 2026-08-12 --file ./invoice.pdf
 *
 * Uses the same database and storage (local or S3) settings as the API.
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { Repository } from 'typeorm';
import { AppModule } from '../app.module.js';
import {
  DOCUMENT_TYPES,
  type DocumentType,
} from '../documents/document.entity.js';
import { DocumentsService } from '../documents/documents.service.js';
import { User } from '../users/user.entity.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    type: { type: 'string' },
    title: { type: 'string' },
    reference: { type: 'string' },
    issued: { type: 'string' },
    file: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { email, type, title, reference, file } = values;
const issued = values.issued ?? new Date().toISOString().slice(0, 10);
if (!email || !type || !title || !file) {
  fail(
    'Required: --email --type --title --file (optional: --reference --issued YYYY-MM-DD)',
  );
}
if (!DOCUMENT_TYPES.includes(type as DocumentType)) {
  fail(`--type must be one of: ${DOCUMENT_TYPES.join(', ')}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(issued)) fail('--issued must be YYYY-MM-DD');

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const users = app.get<Repository<User>>(getRepositoryToken(User));
  const user = await users.findOne({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) fail(`No account with email ${email}`);
  const { id } = await app
    .get(DocumentsService)
    .addForUser(
      user.id,
      { type: type as DocumentType, title, reference, issuedOn: issued },
      await readFile(file),
    );
  console.log(`Added document ${id} for ${user.email}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await app.close();
}
