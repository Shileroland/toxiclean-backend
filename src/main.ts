import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The webapp (BFF) forwards the client IP in X-Forwarded-For; trust it so rate limits
  // apply per client. Set TRUST_PROXY to the BFF's address/subnet in production.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
