import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum SenderType {
  USER = 'USER',
  BOT = 'BOT',
}

@Entity()
@Index(['conversation', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  @Index()
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: SenderType,
  })
  senderType: SenderType;

  @Column('text')
  content: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}