import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createMessage(conversationId: string, senderId: string, content: string) {
    const message = await this.prisma.message.create({
      data: { conversationId, senderId, content },
      include: { sender: { select: { id: true, name: true, avatar: true, displayName: true, role: true } } },
    });

    if (message.sender.role === 'THERAPIST') {
      const convo = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { clientId: true },
      });
      if (convo) {
        const assignment = await this.prisma.assignment.findUnique({
          where: { patientId_therapistId: { patientId: convo.clientId, therapistId: senderId } },
        });
        if (assignment?.patientVisibleName) {
          return {
            ...message,
            sender: {
              ...message.sender,
              name: assignment.patientVisibleName,
              displayName: assignment.patientVisibleName,
            },
          };
        }
      }
    }
    return message;
  }



  async getConversations(userId: string) {
    const convoData = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { therapistId: userId },
          { clientId: userId },
        ],
      },
      include: {
        therapist: { select: { id: true, name: true, avatar: true, displayName: true, email: true } },
        client: { select: { id: true, name: true, avatar: true, displayName: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Apply per-patient labels
    const assignments = await this.prisma.assignment.findMany({
      where: {
        OR: [{ patientId: userId }, { therapistId: userId }],
      },
    });

    return convoData.map(convo => {
      // If the caller is the patient, they see the therapist's alias
      if (convo.clientId === userId) {
        const assignment = assignments.find(a => a.therapistId === convo.therapistId);
        if (assignment?.patientVisibleName) {
          return {
            ...convo,
            therapist: {
              ...convo.therapist,
              name: assignment.patientVisibleName,
              displayName: assignment.patientVisibleName,
            },
          };
        }
      }
      return convo;
    });
  }

  async getSupportConversations() {
    const supportUser = await this.prisma.user.findFirst({
      where: { email: 'support@tapfere.com' },
      select: { id: true },
    });
    if (!supportUser) return { supportUserId: null, conversations: [] };

    const conversations = await this.prisma.conversation.findMany({
      where: { therapistId: supportUser.id },
      include: {
        therapist: { select: { id: true, name: true, avatar: true, displayName: true, email: true } },
        client: { select: { id: true, name: true, avatar: true, displayName: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return { supportUserId: supportUser.id, conversations };
  }

  async getConversationsAdmin(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        OR: [{ therapistId: userId }, { clientId: userId }],
      },
      include: {
        therapist: { select: { id: true, name: true, avatar: true, displayName: true, email: true } },
        client: { select: { id: true, name: true, avatar: true, displayName: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async getMessages(conversationId: string, viewerId?: string) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true, avatar: true, displayName: true, role: true } } },
    });

    if (!viewerId) return messages;

    // If viewer is patient, override therapist sender names
    const assignments = await this.prisma.assignment.findMany({
      where: { patientId: viewerId },
    });

    return messages.map(m => {
      if (m.sender.role === 'THERAPIST') {
        const assignment = assignments.find(a => a.therapistId === m.senderId);
        if (assignment?.patientVisibleName) {
          return {
            ...m,
            sender: {
              ...m.sender,
              name: assignment.patientVisibleName,
              displayName: assignment.patientVisibleName,
            },
          };
        }
      }
      return m;
    });
  }
}
