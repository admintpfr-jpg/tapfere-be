import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { WhitelistModule } from './whitelist/whitelist.module';
import { PatientsModule } from './patients/patients.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    ChatModule,
    WhitelistModule,
    PatientsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
