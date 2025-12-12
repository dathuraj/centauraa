import { Module, Global } from '@nestjs/common';
import { PromptsService } from './prompts.service';

@Global()
@Module({
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
