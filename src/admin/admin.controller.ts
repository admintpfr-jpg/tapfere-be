import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/system')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminSystemController {
  constructor(private readonly adminService: AdminService) {}

  @Get('config')
  getConfig() {
    return this.adminService.getConfig();
  }

  @Post('config')
  updateConfig(
    @Body()
    data: {
      clientWelcomeMessage?: string;
      therapistWelcomeMessage?: string;
    },
  ) {
    return this.adminService.updateConfig(data);
  }

  @Post('announce')
  broadcast(
    @Body()
    data: {
      content: string;
      targetRole: 'ALL' | 'CLIENT' | 'THERAPIST';
    },
  ) {
    return this.adminService.broadcastAnnouncement(
      data.content,
      data.targetRole,
    );
  }

  @Get('support/conversations')
  getSupportConversations() {
    return this.adminService.getSupportConversations();
  }

  @Post('support/conversations/:id/messages')
  sendSupportMessage(
    @Param('id') id: string,
    @Body() data: { content: string },
  ) {
    return this.adminService.sendSupportMessage(id, data.content);
  }
}
