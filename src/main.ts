import { config } from 'dotenv';
// Load .env for local dev only. In production (Railway/hosted) the platform
// injects real env vars — never let a stray .env override them.
if (process.env.NODE_ENV !== 'production') {
  config();
}
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = process.env.FRONTEND_URL?.split(',') || [
    'http://localhost:5173',
  ];
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Physiotherapy Platform API')
    .setDescription('Backend APIs for the Physiotherapy Communication Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
