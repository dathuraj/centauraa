import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CustomDatabaseLogger } from './custom-logger';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get('DATABASE_HOST'),
  port: configService.get('DATABASE_PORT'),
  username: configService.get('DATABASE_USER'),
  password: configService.get('DATABASE_PASSWORD'),
  database: configService.get('DATABASE_NAME'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: true, // Set to false in production
  logging: ['error', 'warn', 'query'], // Re-enabled query logging with custom logger
  logger: new CustomDatabaseLogger(), // Custom logger that filters embedding queries
  maxQueryExecutionTime: 1000, // Log queries slower than 1 second

  // Connection pooling for better performance
  extra: {
    max: 20, // Maximum number of clients in the pool
    min: 5,  // Minimum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Timeout after 5 seconds if no connection available
  },
});