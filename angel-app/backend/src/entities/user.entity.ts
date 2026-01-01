import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { MoodLog } from './mood-log.entity';
import { Medication } from './medication.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  otp: string;

  @Column({ type: 'timestamp', nullable: true })
  otpExpiresAt: Date;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'text', nullable: true })
  clinicalProfile: string;

  @Column({ type: 'timestamp', nullable: true })
  clinicalProfileUpdatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Conversation, (conversation) => conversation.user)
  conversations: Conversation[];

  @OneToMany(() => MoodLog, (moodLog) => moodLog.user)
  moodLogs: MoodLog[];

  @OneToMany(() => Medication, (medication) => medication.user)
  medications: Medication[];
}