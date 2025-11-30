import { Controller, Post, Get, Body, UseGuards, Request, Query } from '@nestjs/common';
import { MoodService } from './mood.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('mood')
export class MoodController {
  constructor(private readonly moodService: MoodService) {}

  @Post('log')
  @UseGuards(JwtAuthGuard)
  async logMood(
    @Request() req,
    @Body('mood') mood: number,
    @Body('note') note?: string,
  ) {
    return this.moodService.logMood(req.user.userId, mood, note);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getMoodHistory(@Request() req, @Query('days') days?: number) {
    return this.moodService.getMoodHistory(req.user.userId, days);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getMoodStats(@Request() req, @Query('days') days?: number) {
    return this.moodService.getMoodStats(req.user.userId, days);
  }
}