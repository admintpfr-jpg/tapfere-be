import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private chatGateway: ChatGateway,
  ) {}

  async onModuleInit() {
    // Ensure global config exists
    await this.prisma.systemConfig.upsert({
      where: { id: 'global-config' },
      update: {},
      create: { id: 'global-config' },
    });
  }

  async getConfig() {
    return this.prisma.systemConfig.findUnique({
      where: { id: 'global-config' },
    });
  }

  async updateConfig(data: {
    clientWelcomeMessage?: string;
    therapistWelcomeMessage?: string;
  }) {
    return this.prisma.systemConfig.update({
      where: { id: 'global-config' },
      data,
    });
  }

  async broadcastAnnouncement(
    content: string,
    targetRole: 'ALL' | 'CLIENT' | 'THERAPIST',
  ) {
    const systemUser = await this.usersService.ensureSystemUser();

    // Find all target users
    const users = await this.prisma.user.findMany({
      where: {
        ...(targetRole !== 'ALL' && { role: targetRole as any }),
        NOT: { id: systemUser.id },
      },
      select: { id: true },
    });

    for (const user of users) {
      await this.ensureAndSendMessage(systemUser.id, user.id, content);
    }

    return { count: users.length };
  }

  private async ensureAndSendMessage(
    systemUserId: string,
    targetUserId: string,
    content: string,
  ) {
    let convo = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { therapistId: systemUserId, clientId: targetUserId },
          { therapistId: targetUserId, clientId: systemUserId },
        ],
      },
    });

    if (!convo) {
      convo = await this.prisma.conversation.create({
        data: { therapistId: systemUserId, clientId: targetUserId },
      });
    }

    const message = await this.prisma.message.create({
      data: { conversationId: convo.id, senderId: systemUserId, content },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    this.chatGateway.server.to(convo.id).emit('newMessage', message);
  }

  async getSupportConversations() {
    const systemUser = await this.usersService.ensureSystemUser();

    return this.prisma.conversation.findMany({
      where: {
        OR: [{ therapistId: systemUser.id }, { clientId: systemUser.id }],
      },
      include: {
        therapist: {
          select: {
            id: true,
            name: true,
            avatar: true,
            displayName: true,
            email: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            avatar: true,
            displayName: true,
            email: true,
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async sendSupportMessage(conversationId: string, content: string) {
    const systemUser = await this.usersService.ensureSystemUser();

    const convo = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ therapistId: systemUser.id }, { clientId: systemUser.id }],
      },
    });
    if (!convo) throw new NotFoundException('Support conversation not found');

    const message = await this.prisma.message.create({
      data: { conversationId, senderId: systemUser.id, content },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    this.chatGateway.server.to(conversationId).emit('newMessage', message);
    return message;
  }
}
