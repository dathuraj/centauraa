import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend/mobile app access
  app.enableCors({
    origin: true, // Allow all origins in development - restrict in production
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
