import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { resolveJwtSecret } from './auth/jwt-secret.util';

async function bootstrap() {
  // Fail fast if production JWT is missing/weak.
  resolveJwtSecret();

  const app = await NestFactory.create(AppModule);

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = parseInt(process.env.API_PORT || '4000', 10);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on :${port}`, 'Bootstrap');
}
bootstrap();
