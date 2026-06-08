import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  login(user: User) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }

  async verifyGoogleToken(accessToken: string) {
    try {
      // 1. Confused Deputy Protection: Verify exactly which Client ID this token was issued to.
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`,
      );
      if (!tokenInfoRes.ok) {
        throw new UnauthorizedException('Invalid Google token provided.');
      }

      const tokenInfo = await tokenInfoRes.json();
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;

      // If backend has the Client ID set, rigorously enforce the match
      if (expectedClientId && tokenInfo.aud !== expectedClientId) {
        throw new UnauthorizedException(
          'Security Error: Token audience mismatch. This token belongs to a different app!',
        );
      }

      // 2. Fetch Verified User Profile
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!response.ok) {
        throw new UnauthorizedException('Invalid Google token provided.');
      }

      const profile = await response.json();

      // Let UsersService handle DB interaction completely using robust mapping
      const user = await this.usersService.verifyAndCreateUser(
        profile.email,
        profile.name,
        profile.picture,
        profile.sub,
      );

      return this.login(user);
    } catch (error) {
      throw new UnauthorizedException(error.message || 'Google Auth Failed');
    }
  }
}
