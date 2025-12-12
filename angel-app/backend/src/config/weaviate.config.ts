import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import weaviate, { WeaviateClient } from 'weaviate-ts-client';

@Injectable()
export class WeaviateConfigService {
  private client: WeaviateClient;

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient() {
    const scheme = this.configService.get<string>('WEAVIATE_SCHEME', 'http');
    const host = this.configService.get<string>('WEAVIATE_HOST', 'localhost:8080');
    const apiKeys = this.configService.get<string>('WEAVIATE_API_KEY_ALLOWED_KEYS', '');

    // Use the first (admin) API key if available
    const apiKey = apiKeys.split(',')[0]?.trim() || '';

    const config: any = {
      scheme,
      host,
    };

    // Add API key authentication if configured
    if (apiKey) {
      config.apiKey = new weaviate.ApiKey(apiKey);
    }

    this.client = weaviate.client(config);

    console.log(`Weaviate client initialized: ${scheme}://${host} (auth: ${apiKey ? 'enabled' : 'disabled'})`);
  }

  getClient(): WeaviateClient {
    return this.client;
  }

  async initializeSchema() {
    // Check if ConversationEmbedding class exists
    try {
      await this.client.schema.classGetter().withClassName('ConversationEmbedding').do();
      console.log('ConversationEmbedding schema already exists');
    } catch (error) {
      // Create the schema if it doesn't exist
      console.log('Creating ConversationEmbedding schema...');

      const classObj = {
        class: 'ConversationEmbedding',
        description: 'Conversation embeddings for semantic search and RAG',
        vectorizer: 'none', // We'll provide our own vectors from OpenAI
        properties: [
          {
            name: 'conversationId',
            dataType: ['text'],
            description: 'ID of the conversation',
            indexFilterable: true,
            indexSearchable: true,
          },
          {
            name: 'turnIndex',
            dataType: ['int'],
            description: 'Position in conversation',
          },
          {
            name: 'speaker',
            dataType: ['text'],
            description: 'USER or BOT',
            indexFilterable: true,
          },
          {
            name: 'textChunk',
            dataType: ['text'],
            description: 'Message content',
            indexSearchable: true,
          },
          {
            name: 'timestamp',
            dataType: ['number'],
            description: 'Unix timestamp',
          },
        ],
        vectorIndexConfig: {
          distance: 'cosine', // Use cosine distance for similarity
        },
      };

      await this.client.schema.classCreator().withClass(classObj).do();
      console.log('ConversationEmbedding schema created successfully');
    }
  }
}
