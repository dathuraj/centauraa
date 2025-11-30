import { Logger as TypeOrmLogger } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * Custom TypeORM logger that filters out embedding vector queries
 */
export class CustomDatabaseLogger implements TypeOrmLogger {
  private readonly logger = new Logger('Database');

  logQuery(query: string, parameters?: any[]) {
    // Skip logging queries with embedding vectors (they're too large)
    if (
      query.includes('embedding') ||
      query.includes('vector') ||
      (parameters && JSON.stringify(parameters).length > 10000)
    ) {
      // Don't log these queries - they contain huge embedding arrays
      return;
    }

    this.logger.log(`Query: ${query}`);
    if (parameters && parameters.length) {
      this.logger.log(`Parameters: ${JSON.stringify(parameters)}`);
    }
  }

  logQueryError(error: string, query: string, parameters?: any[]) {
    // Always log errors, but sanitize embedding data
    let sanitizedQuery = query;
    let sanitizedParams = parameters;

    if (query.includes('embedding') || query.includes('vector')) {
      sanitizedQuery = query.substring(0, 200) + '... [embedding query]';
      sanitizedParams = ['[embedding parameters hidden]'];
    }

    this.logger.error(`Query failed: ${sanitizedQuery}`);
    this.logger.error(`Error: ${error}`);
    if (sanitizedParams) {
      this.logger.error(`Parameters: ${JSON.stringify(sanitizedParams)}`);
    }
  }

  logQuerySlow(time: number, query: string, parameters?: any[]) {
    // Log slow queries but sanitize embedding data
    let sanitizedQuery = query;
    let sanitizedParams = parameters;

    if (query.includes('embedding') || query.includes('vector')) {
      sanitizedQuery = query.substring(0, 200) + '... [embedding query]';
      sanitizedParams = ['[embedding parameters hidden]'];
    }

    this.logger.warn(`Slow query detected (${time}ms): ${sanitizedQuery}`);
    if (sanitizedParams) {
      this.logger.warn(`Parameters: ${JSON.stringify(sanitizedParams)}`);
    }
  }

  logSchemaBuild(message: string) {
    this.logger.log(message);
  }

  logMigration(message: string) {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: any) {
    switch (level) {
      case 'log':
        this.logger.log(message);
        break;
      case 'info':
        this.logger.log(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
    }
  }
}
