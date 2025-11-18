import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum SenderType {
  USER = 'user',
  BOT = 'bot',
}

@Entity()
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: SenderType,
  })
  senderType: SenderType;

  @Column('text')
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}