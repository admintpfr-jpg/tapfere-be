import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly usersService: UsersService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'placeholder_client_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder_secret',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const { id: googleId, emails, displayName, photos } = profile;
    const email = emails[0].value;
    const avatar = photos[0]?.value;

    const user = await this.usersService.verifyAndCreateUser(email, displayName, avatar, googleId);
    done(null, user);
  }
}
