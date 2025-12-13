import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import angelPromptsLocal from './angel-system-prompt.json';

export interface AngelPrompts {
  angelCoreGuidelines: string;
  angelRoleDescription: string;
  ragInstruction: string;
  crisisProtocol: string;
  safetyGuidelines: string;
}

@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly logger = new Logger(PromptsService.name);
  private s3Client: S3Client;
  private prompts: AngelPrompts;
  private readonly bucketName: string;
  private readonly s3Key: string;
  private readonly useS3: boolean;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get('PROMPTS_S3_BUCKET', '');
    this.s3Key = this.configService.get('PROMPTS_S3_KEY', 'angel-system-prompt.json');
    this.useS3 = !!this.bucketName;

    if (this.useS3) {
      const region = this.configService.get('AWS_REGION', 'us-east-1');
      this.s3Client = new S3Client({ region });
      this.logger.log(`PromptsService initialized with S3: bucket=${this.bucketName}, key=${this.s3Key}, region=${region}`);
    } else {
      this.logger.log('PromptsService initialized with local file (S3 bucket not configured)');
    }
  }

  async onModuleInit() {
    await this.loadPrompts();
  }

  /**
   * Load prompts from S3 or fallback to local file
   */
  private async loadPrompts(): Promise<void> {
    try {
      if (this.useS3) {
        this.logger.log(`Loading prompts from S3: s3://${this.bucketName}/${this.s3Key}`);
        const prompts = await this.loadPromptsFromS3();
        this.prompts = prompts;
        this.logger.log('Successfully loaded prompts from S3');
      } else {
        this.logger.log('Loading prompts from local file');
        this.prompts = angelPromptsLocal as AngelPrompts;
        this.logger.log('Successfully loaded prompts from local file');
      }
    } catch (error) {
      this.logger.error('Failed to load prompts from S3, falling back to local file', error);
      this.prompts = angelPromptsLocal as AngelPrompts;
    }
  }

  /**
   * Fetch prompts from S3
   */
  private async loadPromptsFromS3(): Promise<AngelPrompts> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: this.s3Key,
    });

    const response = await this.s3Client.send(command);
    const bodyContents = await response.Body?.transformToString();

    if (!bodyContents) {
      throw new Error('Empty response from S3');
    }

    return JSON.parse(bodyContents) as AngelPrompts;
  }

  /**
   * Get the current prompts
   */
  getPrompts(): AngelPrompts {
    return this.prompts;
  }

  /**
   * Reload prompts from S3 (useful for hot-reloading configuration)
   */
  async reloadPrompts(): Promise<void> {
    this.logger.log('Reloading prompts...');
    await this.loadPrompts();
  }
}
