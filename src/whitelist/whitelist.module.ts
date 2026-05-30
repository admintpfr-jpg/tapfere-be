import { Module } from '@nestjs/common';
import { WhitelistService } from './whitelist.service';
import { WhitelistController } from './whitelist.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WhitelistController],
  providers: [WhitelistService],
})
export class WhitelistModule {}
