import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class WhitelistService {
  constructor(private readonly prisma: PrismaService) {}

  async addEmail(email: string, role: Role = Role.CLIENT) {
    const existing = await this.prisma.whitelistedUser.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Email already whitelisted');
    }
    return this.prisma.whitelistedUser.create({
      data: { email, role },
    });
  }

  async removeEmail(email: string) {
    const existing = await this.prisma.whitelistedUser.findUnique({
      where: { email },
    });
    if (!existing) {
      throw new NotFoundException('Email not found in whitelist');
    }
    return this.prisma.whitelistedUser.delete({
      where: { email },
    });
  }

  async getAll() {
    return this.prisma.whitelistedUser.findMany();
  }
}
