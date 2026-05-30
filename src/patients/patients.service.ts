import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private chatGateway: ChatGateway,
  ) {}

  async getPatients() {
    const users = await this.prisma.user.findMany({
      where: { role: 'CLIENT' },
      include: {
        patientAssignments: {
          select: {
            id: true,
            patientVisibleName: true,
            therapistId: true,
            therapist: {
              select: { id: true, email: true, name: true, displayName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const whitelisted = await this.prisma.whitelistedUser.findMany({
      where: { role: 'CLIENT' },
    });

    // Merge: show all whitelisted, and use real User data if available
    const merged = whitelisted.map(w => {
      const user = users.find(u => u.email === w.email);
      if (user) return user;
      return {
        id: `pending-${w.id}`,
        email: w.email,
        name: w.displayName || 'Pending Registration',
        displayName: w.displayName,
        patientAssignments: [],
        createdAt: w.createdAt,
        isPending: true,
      };
    });

    // Add any Users that might not be in whitelist (legacy or direct add if any)
    users.forEach(u => {
      if (!merged.find(m => m.email === u.email)) {
        merged.push(u);
      }
    });

    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getTherapists() {
    const users = await this.prisma.user.findMany({
      where: { role: 'THERAPIST' },
      select: { id: true, email: true, name: true, displayName: true, avatar: true, createdAt: true },
      orderBy: { name: 'asc' },
    });

    const whitelisted = await this.prisma.whitelistedUser.findMany({
      where: { role: 'THERAPIST' },
    });

    const merged = whitelisted.map(w => {
      const user = users.find(u => u.email === w.email);
      if (user) return user;
      return {
        id: `pending-${w.id}`,
        email: w.email,
        name: w.displayName || 'Pending Registration',
        displayName: w.displayName,
        avatar: null,
        createdAt: w.createdAt,
        isPending: true,
      };
    });

    users.forEach(u => {
      if (!merged.find(m => m.email === u.email)) {
        merged.push(u);
      }
    });

    return merged;
  }

  async getTherapistsWithPatients() {
    const users = await this.prisma.user.findMany({
      where: { role: 'THERAPIST' },
      include: {
        therapistAssignments: {
          include: {
            patient: {
              select: { id: true, email: true, name: true, displayName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const whitelisted = await this.prisma.whitelistedUser.findMany({
      where: { role: 'THERAPIST' },
    });

    const merged = whitelisted.map(w => {
      const user = users.find(u => u.email === w.email);
      if (user) return user;
      return {
        id: `pending-${w.id}`,
        email: w.email,
        name: w.displayName || 'Pending Registration',
        displayName: w.displayName,
        therapistAssignments: [],
        createdAt: w.createdAt,
        isPending: true,
      };
    });

    users.forEach(u => {
      if (!merged.find(m => m.email === u.email)) {
        merged.push(u);
      }
    });

    return merged;
  }

  async assignTherapist(patientId: string, therapistId: string, patientVisibleName?: string, adminLabel?: string) {
    const patient = await this.prisma.user.findUnique({ where: { id: patientId, role: 'CLIENT' } });
    if (!patient) throw new NotFoundException('Patient not found');

    const therapist = await this.prisma.user.findUnique({ where: { id: therapistId, role: 'THERAPIST' } });
    if (!therapist) throw new NotFoundException('Therapist not found');

    const existingAssignment = await this.prisma.assignment.findUnique({
      where: { patientId_therapistId: { patientId, therapistId } },
    });
    const isNewAssignment = !existingAssignment;

    const assignment = await this.prisma.assignment.upsert({
      where: {
        patientId_therapistId: { patientId, therapistId },
      },
      create: { patientId, therapistId, patientVisibleName, adminLabel },
      update: { patientVisibleName, adminLabel },
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: { therapistId, clientId: patientId },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { therapistId, clientId: patientId },
      });
    }

    if (isNewAssignment) {
      await this.sendAssignmentNotification(patient, therapist, patientVisibleName);
    }

    return assignment;
  }

  private async sendAssignmentNotification(
    patient: { id: string; name: string; displayName?: string | null },
    therapist: { id: string; name: string; displayName?: string | null },
    patientVisibleName?: string,
  ) {
    const systemUser = await this.usersService.ensureSystemUser();

    const therapistDisplayName = patientVisibleName || therapist.displayName || therapist.name;
    const clientDisplayName = patient.displayName || patient.name;

    await this.sendSystemMessage(
      systemUser.id,
      therapist.id,
      `You have been assigned to ${clientDisplayName}. They are now available in your chat.`,
    );

    await this.sendSystemMessage(
      systemUser.id,
      patient.id,
      `You have been assigned to ${therapistDisplayName}. They are now available in your chat.`,
    );
  }

  private async sendSystemMessage(systemUserId: string, targetUserId: string, content: string) {
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
        sender: { select: { id: true, name: true, avatar: true, displayName: true, role: true } },
      },
    });

    this.chatGateway.server.to(convo.id).emit('newMessage', message);
  }

  async removeAssignment(patientId: string, therapistId: string) {
    return this.prisma.assignment.delete({
      where: {
        patientId_therapistId: { patientId, therapistId },
      },
    });
  }

  async updateDisplayName(userId: string, displayName: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { displayName },
    });
  }
}
