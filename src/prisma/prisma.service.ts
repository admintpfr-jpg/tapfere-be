import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private static readonly logger = new Logger(PrismaService.name);

  constructor() {
    let connectionString = process.env.DATABASE_URL;

    // Fail fast with a clear message instead of silently defaulting to
    // localhost:5432 (which surfaces as a confusing ECONNREFUSED at boot).
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. On Railway, set it in the service Variables ' +
          '(e.g. DATABASE_URL=${{Postgres.DATABASE_URL}}) and redeploy.',
      );
    }

    let host = 'unknown';
    let isLocal = false;
    let isRailwayInternal = false;
    try {
      const parsed = new URL(connectionString);
      host = parsed.hostname;
      isLocal = host === 'localhost' || host === '127.0.0.1';
      isRailwayInternal = host.endsWith('.railway.internal');
      // pg does not understand `sslmode`; strip it and control SSL ourselves.
      if (parsed.searchParams.has('sslmode')) {
        parsed.searchParams.delete('sslmode');
        connectionString = parsed.toString();
      }
    } catch {
      // Fallback if URL parsing fails — leave connectionString untouched.
    }

    // SSL only for external managed hosts. Local dev and Railway's private
    // network (*.railway.internal) speak plaintext and reject/refuse TLS.
    const sslConfig =
      isLocal || isRailwayInternal ? undefined : { rejectUnauthorized: false };

    PrismaService.logger.log(
      `Connecting to Postgres host=${host} ssl=${!!sslConfig} ` +
        `(local=${isLocal}, railwayInternal=${isRailwayInternal})`,
    );

    const pool = new Pool({ connectionString, ssl: sslConfig });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
