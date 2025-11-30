import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body('email') email: string) {
    return this.authService.register(email);
  }

  @Post('verify')
  async verify(@Body('email') email: string, @Body('otp') otp: string) {
    return this.authService.verifyOTP(email, otp);
  }

  @Post('login')
  async login(@Body('email') email: string) {
    return this.authService.login(email);
  }
}