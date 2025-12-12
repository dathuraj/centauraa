import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as fs from 'fs';

async function bootstrap() {
  // HTTPS configuration
  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';
  const httpsOptions = httpsEnabled
    ? {
        key: fs.readFileSync(
          process.env.SSL_KEY_PATH || '/app/ssl/key.pem',
        ),
        cert: fs.readFileSync(
          process.env.SSL_CERT_PATH || '/app/ssl/cert.pem',
        ),
      }
    : undefined;

  const app = await NestFactory.create(AppModule, {
    httpsOptions,
  });

  // Enable CORS for frontend/mobile app access
  app.enableCors({
    origin: true, // Allow all origins in development - restrict in production
    credentials: true,
  });

  const port = process.env.PORT ?? (httpsEnabled ? 443 : 3000);
  await app.listen(port);

  console.log(`Application is running on: ${httpsEnabled ? 'https' : 'http'}://localhost:${port}`);
}
bootstrap();
