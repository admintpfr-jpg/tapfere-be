import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WhitelistService } from './whitelist.service';
import { Role } from '@prisma/client';

@Controller('whitelist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class WhitelistController {
  constructor(private readonly whitelistService: WhitelistService) {}

  @Post()
  async add(@Body('email') email: string, @Body('role') role?: Role) {
    return this.whitelistService.addEmail(email, role);
  }

  @Get()
  async getAll() {
    return this.whitelistService.getAll();
  }

  @Delete(':email')
  async remove(@Param('email') email: string) {
    return this.whitelistService.removeEmail(email);
  }
}
