import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req) {
    return req.user;
  }

  @Get('whitelist')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async getWhitelist() {
    return this.usersService.getWhitelist();
  }

  @Post('whitelist')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async addWhitelistedUser(@Body() body: { email: string; role: string }) {
    return this.usersService.addWhitelistedUser(body.email, body.role);
  }

  @Delete('whitelist/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async removeWhitelistedUser(@Param('id') id: string) {
    return this.usersService.removeWhitelistedUser(id);
  }

  @Patch('whitelist/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async updateWhitelistedUserRole(
    @Param('id') id: string,
    @Body('role') role: string,
  ) {
    return this.usersService.updateWhitelistedUserRole(id, role);
  }

  @Patch(':id/role')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async updateUserRole(@Param('id') id: string, @Body('role') role: string) {
    return this.usersService.updateUserRole(id, role);
  }
}
