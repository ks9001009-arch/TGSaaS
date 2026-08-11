import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { resolveJwtSecret } from './auth/jwt-secret.util';
import { resolveEncryptionKey } from './common/encryption-key.util';

async function bootstrap() {
  // Fail fast if production secrets are missing/weak.
  resolveJwtSecret();
  resolveEncryptionKey();

  const app = await NestFactory.create(AppModule);
  // Trust a single reverse-proxy hop (nginx) so req.ip reflects X-Real-IP / XFF correctly.
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance?.();
  if (instance?.set) instance.set('trust proxy', 1);

  const isProd = process.env.NODE_ENV === 'production';
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (isProd && !corsOrigin) {
    throw new Error(
      'CORS_ORIGIN must be set in production (comma-separated allowlist). Refusing to start with open CORS.',
    );
  }
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Keep false: several legacy endpoints still accept plain @Body() objects.
      // Field allow-lists are enforced inside those services instead.
      forbidNonWhitelisted: false,
    }),
  );

  const port = parseInt(process.env.API_PORT || '4000', 10);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on :${port}`, 'Bootstrap');
}
bootstrap();
