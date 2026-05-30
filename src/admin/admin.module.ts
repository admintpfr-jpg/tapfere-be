import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminSystemController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [PrismaModule, UsersModule, ChatModule],
  controllers: [AdminSystemController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
