import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async register(email: string): Promise<{ message: string }> {
    const existingUser = await this.userRepository.findOne({ where: { email } });

    if (existingUser && existingUser.isVerified) {
      throw new BadRequestException('User already exists');
    }

    const otp = this.generateOTP();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10);

    if (existingUser) {
      existingUser.otp = await bcrypt.hash(otp, 10);
      existingUser.otpExpiresAt = otpExpiresAt;
      await this.userRepository.save(existingUser);
    } else {
      const user = this.userRepository.create({
        email,
        otp: await bcrypt.hash(otp, 10),
        otpExpiresAt,
      });
      await this.userRepository.save(user);
    }

    await this.mailService.sendOTP(email, otp);
    return { message: 'OTP sent to your email' };
  }

  async verifyOTP(email: string, otp: string): Promise<{ access_token: string }> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid email or OTP');
    }

    if (user.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('OTP has expired');
    }

    const isOtpValid = await bcrypt.compare(otp, user.otp);
    if (!isOtpValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    user.isVerified = true;
    user.otp = null as any;
    user.otpExpiresAt = null as any;
    await this.userRepository.save(user);

    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async login(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { email, isVerified: true } });

    if (!user) {
      throw new UnauthorizedException('User not found or not verified');
    }

    const otp = this.generateOTP();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10);

    user.otp = await bcrypt.hash(otp, 10);
    user.otpExpiresAt = otpExpiresAt;
    await this.userRepository.save(user);

    await this.mailService.sendOTP(email, otp);
    return { message: 'OTP sent to your email' };
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}