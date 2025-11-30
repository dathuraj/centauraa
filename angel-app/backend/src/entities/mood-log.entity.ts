import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
export class MoodLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.moodLogs)
  user: User;

  @Column({ type: 'int' })
  mood: number; // 1-5 scale

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}