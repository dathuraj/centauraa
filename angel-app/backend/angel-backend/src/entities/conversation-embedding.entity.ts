import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('conversation_embeddings')
@Index(['conversationId', 'turnIndex'])
export class ConversationEmbedding {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'conversation_id', type: 'text' })
  @Index()
  conversationId: string;

  @Column({ name: 'turn_index', type: 'integer' })
  turnIndex: number;

  @Column({ type: 'text', nullable: true })
  speaker: string;

  @Column({ name: 'text_chunk', type: 'text' })
  textChunk: string;

  @Column({
    type: 'vector',
    length: 1536,
    nullable: true,
  })
  embedding: number[];

  @Column({ type: 'bigint', nullable: true })
  timestamp: number;
}
