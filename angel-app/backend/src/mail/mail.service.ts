import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendOTP(email: string, otp: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Your Angel App Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Welcome to Angel</h2>
          <p>Your verification code is:</p>
          <h1 style="color: #4F46E5; font-size: 36px; letter-spacing: 5px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p style="color: #666;">If you didn't request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">Angel - Your Mental Health Companion</p>
        </div>
      `,
    });
  }
}