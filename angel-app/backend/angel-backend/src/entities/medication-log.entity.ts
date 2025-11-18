import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Medication } from './medication.entity';

@Entity()
export class MedicationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Medication, (medication) => medication.logs)
  medication: Medication;

  @Column({ default: false })
  taken: boolean;

  @Column({ type: 'timestamp', nullable: true })
  takenAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}