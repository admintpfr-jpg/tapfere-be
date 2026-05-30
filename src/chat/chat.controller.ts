import { Controller, Get, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.chatService.getConversations(req.user.id);
  }

  @Get('conversations/:id/messages')
  async getMessages(@Param('id') id: string, @Req() req: any) {
    return this.chatService.getMessages(id, req.user.id);
  }

  @Get('admin/user/:userId/conversations')
  async getAdminConversations(@Param('userId') userId: string, @Req() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin access required');
    return this.chatService.getConversationsAdmin(userId);
  }

  @Get('admin/support/conversations')
  async getSupportConversations(@Req() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Admin access required');
    return this.chatService.getSupportConversations();
  }
}
