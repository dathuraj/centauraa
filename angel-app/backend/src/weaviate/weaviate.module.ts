import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WeaviateConfigService } from '../config/weaviate.config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [WeaviateConfigService],
  exports: [WeaviateConfigService],
})
export class WeaviateModule {}
