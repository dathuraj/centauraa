import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return this.usersService.findOne(req.user.userId);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Request() req, @Body('name') name: string) {
    return this.usersService.updateProfile(req.user.userId, name);
  }
}