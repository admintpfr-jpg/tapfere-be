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

  async getDashboardStats() {
    const [
      activeClientsCount,
      activeTherapistsCount,
      activeAssignments,
      totalMessages,
      totalConversations,
      whitelist,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.user.count({ where: { role: 'THERAPIST' } }),
      this.prisma.assignment.count(),
      this.prisma.message.count(),
      this.prisma.conversation.count(),
      this.prisma.whitelistedUser.findMany(),
    ]);

    const users = await this.prisma.user.findMany({
      select: { email: true },
    });
    const registeredEmails = new Set(users.map(u => u.email));

    const pendingClients = whitelist.filter(
      w => w.role === 'CLIENT' && !registeredEmails.has(w.email)
    ).length;

    const pendingTherapists = whitelist.filter(
      w => w.role === 'THERAPIST' && !registeredEmails.has(w.email)
    ).length;

    const totalPatients = activeClientsCount + pendingClients;
    const totalTherapists = activeTherapistsCount + pendingTherapists;

    const therapists = await this.prisma.user.findMany({
      where: { role: 'THERAPIST' },
      select: {
        id: true,
        name: true,
        displayName: true,
        avatar: true,
        therapistAssignments: {
          select: { id: true },
        },
      },
    });

    const workloadDistribution = therapists.map(t => ({
      id: t.id,
      name: t.displayName || t.name,
      avatar: t.avatar,
      assignedCount: t.therapistAssignments.length,
    })).sort((a, b) => b.assignedCount - a.assignedCount);

    const roleDistribution = {
      ADMIN: await this.prisma.user.count({ where: { role: 'ADMIN' } }),
      THERAPIST: activeTherapistsCount,
      CLIENT: activeClientsCount,
    };

    const [recentUsers, recentAssignments, recentMessages] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.assignment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          patient: { select: { name: true, displayName: true } },
          therapist: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.message.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          sender: { select: { name: true, displayName: true, role: true } },
        },
      }),
    ]);

    const activities = [
      ...recentUsers.map(u => ({
        id: `user-${u.id}`,
        type: 'REGISTRATION',
        title: 'New User Registered',
        description: `${u.name} registered as a ${u.role.toLowerCase()}`,
        time: u.createdAt,
      })),
      ...recentAssignments.map(a => ({
        id: `assign-${a.id}`,
        type: 'ASSIGNMENT',
        title: 'Therapist Assigned',
        description: `${a.therapist.displayName || a.therapist.name} was assigned to ${a.patient.displayName || a.patient.name}`,
        time: a.createdAt,
      })),
      ...recentMessages.map(m => ({
        id: `msg-${m.id}`,
        type: 'MESSAGE',
        title: 'New Chat Message',
        description: `${m.sender.displayName || m.sender.name} sent: "${m.content.slice(0, 30)}${m.content.length > 30 ? '...' : ''}"`,
        time: m.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10);

    return {
      totalPatients,
      activePatients: activeClientsCount,
      pendingPatients: pendingClients,
      totalTherapists,
      activeTherapists: activeTherapistsCount,
      pendingTherapists,
      activeAssignments,
      totalMessages,
      totalConversations,
      workloadDistribution,
      roleDistribution,
      activities,
    };
  }
}
