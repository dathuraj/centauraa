import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Message } from './message.entity';

@Entity()
@Index(['user', 'createdAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.conversations)
  @Index()
  user: User;

  @Column({ nullable: true })
  title: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];
}