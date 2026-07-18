import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class UsersService {
  private readonly SYSTEM_EMAIL = 'support@tapfere.com';

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async createDefaultAdmin(
    email: string,
    name: string,
    avatar: string,
    googleId: string,
  ) {
    return this.prisma.user.create({
      data: {
        email,
        name: name || 'Super Admin',
        avatar,
        googleId,
        role: 'ADMIN', // Prisma schema likely has ADMIN as a string or enum
      },
    });
  }

  async verifyAndCreateUser(
    email: string,
    name: string,
    avatar: string,
    googleId: string,
  ) {
    if (email === 'mhdnazeemc@gmail.com') {
      let user = await this.prisma.user.findUnique({ where: { email } });
      if (!user)
        user = await this.createDefaultAdmin(email, name, avatar, googleId);
      return user;
    }

    const whitelistedUser = await this.prisma.whitelistedUser.findUnique({
      where: { email },
    });
    if (!whitelistedUser) {
      throw new UnauthorizedException(
        'You are not authorized. Please go to the admin and get access.',
      );
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          googleId,
          email,
          name,
          avatar,
          role: whitelistedUser.role,
          displayName: whitelistedUser.displayName || name,
          lastLogin: new Date(),
        },
      });

      // Newly onboarded user: send a welcome email (fire-and-forget)
      this.mailService
        .sendOnboardingEmail(
          user.email,
          user.displayName || user.name,
          user.role,
        )
        .catch(() => {
          // Error already logged by MailService, caught to prevent unhandled rejection
        });
    } else {
      // Update google ID, avatar, and lastLogin
      user = await this.prisma.user.update({
        where: { email },
        data: {
          googleId,
          avatar,
          lastLogin: new Date(),
          // Passing the whitelist check means the account is active again.
          isActive: true,
          // Sync displayName if it was updated in whitelist but not user profile
          ...(whitelistedUser.displayName && {
            displayName: whitelistedUser.displayName,
          }),
        },
      });
    }

    // Ensure Client or Therapist gets a welcome message from Tapfere
    if (user.role === 'CLIENT' || user.role === 'THERAPIST') {
      await this.ensureWelcomeConversation(user.id);
    }

    return user;
  }

  async ensureSystemUser() {
    let systemUser = await this.prisma.user.findUnique({
      where: { email: this.SYSTEM_EMAIL },
    });
    if (!systemUser) {
      systemUser = await this.prisma.user.create({
        data: {
          email: this.SYSTEM_EMAIL,
          name: 'Tapfere Support',
          displayName: 'Tapfere Support',
          role: 'ADMIN',
          avatar:
            'https://ui-avatars.com/api/?name=Tapfere&background=0f385a&color=fff',
        },
      });
    }
    return systemUser;
  }

  async ensureWelcomeConversation(userId: string) {
    const systemUser = await this.ensureSystemUser();

    // Check if conversation already exists
    const existing = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { therapistId: systemUser.id, clientId: userId },
          { therapistId: userId, clientId: systemUser.id },
        ],
      },
    });

    if (!existing) {
      const targetUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      const role = targetUser?.role || 'CLIENT';

      const config = await this.prisma.systemConfig.findUnique({
        where: { id: 'global-config' },
      });

      const convo = await this.prisma.conversation.create({
        data: {
          therapistId: systemUser.id,
          clientId: userId,
        },
      });

      const defaultClientMsg = `Hi there! Welcome to Tapfere. 🌿 We're so glad you're here. We are currently reviewing your profile and will assign a specialized physiotherapist to you shortly. In the meantime, feel free to explore our resources!`;
      const defaultTherapistMsg = `Welcome to the Tapfere clinical team! 🩺 We're excited to have you on board. This channel will serve as your direct line for clinical updates, platform announcements, and administrative support. We'll notify you here as soon as your first patients are assigned!`;

      const messageContent =
        role === 'THERAPIST'
          ? (config?.therapistWelcomeMessage || defaultTherapistMsg).replace(
              '{name}',
              targetUser?.name || 'Therapist',
            )
          : (config?.clientWelcomeMessage || defaultClientMsg).replace(
              '{name}',
              targetUser?.name || 'Friend',
            );

      await this.prisma.message.create({
        data: {
          conversationId: convo.id,
          senderId: systemUser.id,
          content: messageContent,
        },
      });
    }
  }

  async getWhitelist() {
    const whitelist = await this.prisma.whitelistedUser.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Fetch matching users to get lastLogin info
    const emails = whitelist.map((w) => w.email);
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, lastLogin: true },
    });

    const userMap = new Map(users.map((u) => [u.email, u.lastLogin]));

    return whitelist.map((w) => ({
      ...w,
      lastLogin: userMap.get(w.email) || null,
    }));
  }

  async addWhitelistedUser(email: string, role: string, displayName?: string) {
    const existing = await this.prisma.whitelistedUser.findUnique({
      where: { email },
    });
    if (existing)
      throw new UnauthorizedException('User is already whitelisted.');

    // Re-whitelisting a previously removed user reactivates their account.
    await this.prisma.user
      .update({ where: { email }, data: { isActive: true } })
      .catch(() => null);

    return this.prisma.whitelistedUser.create({
      data: {
        email,
        role: role as any,
        displayName,
      },
    });
  }

  async removeWhitelistedUser(id: string) {
    const removed = await this.prisma.whitelistedUser.delete({ where: { id } });

    // Mark the linked account as deactivated so it can be flagged in chats.
    const account = await this.prisma.user.update({
      where: { email: removed.email },
      data: { isActive: false },
    }).catch(() => null);
    const recipientName =
      removed.displayName || account?.name || removed.email.split('@')[0];
    this.mailService
      .sendAccountDeactivationEmail(removed.email, recipientName)
      .catch(() => {
        // Error already logged by MailService, caught to prevent unhandled rejection
      });

    return removed;
  }

  async updateWhitelistedUserRole(id: string, role: string) {
    return this.prisma.whitelistedUser.update({
      where: { id },
      data: { role: role as any },
    });
  }

  async updateUserRole(id: string, role: string) {
    return this.prisma.user.update({
      where: { id },
      data: { role: role as any },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
