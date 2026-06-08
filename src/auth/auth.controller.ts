import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google-login')
  async verifyGoogleToken(@Body('accessToken') accessToken: string) {
    return this.authService.verifyGoogleToken(accessToken);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    const { access_token } = this.authService.login(req.user);
    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }

  @Post('logout')
  logout(@Res() res) {
    res.clearCookie('access_token');
    return res.status(200).json({ message: 'Logged out successfully' });
  }
}
