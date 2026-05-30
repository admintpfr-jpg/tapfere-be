import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    let connectionString = process.env.DATABASE_URL;
    let isLocal = false;
    let sslConfig: any = undefined;

    if (connectionString) {
      isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
      if (!isLocal) {
        sslConfig = { rejectUnauthorized: false };
        try {
          const parsedUrl = new URL(connectionString);
          if (parsedUrl.searchParams.has('sslmode')) {
            parsedUrl.searchParams.delete('sslmode');
            connectionString = parsedUrl.toString();
          }
        } catch (e) {
          // Fallback if URL parsing fails
        }
      }
    }

    const pool = new Pool({
      connectionString,
      ssl: sslConfig,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
