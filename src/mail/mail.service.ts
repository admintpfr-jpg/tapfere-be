import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true';
    this.fromAddress = process.env.SMTP_FROM || 'Tapfere <noreply@tapfere.com>';

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(
        `SMTP Mailer initialized successfully. Host: ${host}:${port}`,
      );
    } else {
      this.logger.warn(
        'SMTP environment variables are incomplete or missing. Mailer will run in DEV FALLBACK mode (logging to console).',
      );
    }
  }

  async sendNewMessageNotification(
    to: string,
    recipientName: string,
    senderName: string,
    messageContent: string,
  ): Promise<boolean> {
    const chatLink =
      process.env.EMAIL_REDIRECT_URL ||
      `${process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173'}/chat`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Message Notification</title>
  <style>
    body {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .email-header {
      background: linear-gradient(135deg, #0f172a 0%, #0d9488 100%);
      padding: 32px;
      text-align: center;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .email-body {
      padding: 40px 32px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .intro-text {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .message-card {
      background-color: #f1f5f9;
      border-left: 4px solid #14b8a6;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 32px;
    }
    .sender-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #0d9488;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }
    .message-body-content {
      font-size: 15px;
      line-height: 1.5;
      color: #1e293b;
      font-style: italic;
      margin: 0;
    }
    .cta-container {
      text-align: center;
      margin-bottom: 16px;
    }
    .cta-button {
      display: inline-block;
      background-color: #0d9488;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.2);
      transition: background-color 0.2s ease;
    }
    .cta-button:hover {
      background-color: #0f766e;
    }
    .email-footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .email-footer p {
      font-size: 12px;
      color: #94a3b8;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Tapfere</h1>
    </div>
    <div class="email-body">
      <p class="greeting">Hello ${recipientName},</p>
      <p class="intro-text">You have received a new message regarding your ongoing physiotherapy care. Here's a brief preview:</p>
      
      <div class="message-card">
        <div class="sender-title">${senderName}</div>
        <p class="message-body-content">"${messageContent}"</p>
      </div>
      
      <div class="cta-container">
        <a href="${chatLink}" class="cta-button">View Message in Chat</a>
      </div>
    </div>
    <div class="email-footer">
      <p>This is an automated notification. Please do not reply directly to this email.</p>
      <p>&copy; ${new Date().getFullYear()} Tapfere. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

    if (!this.transporter) {
      this.logger.log(`[DEV FALLBACK] Simulated Email Notification:
        To: ${to} (${recipientName})
        Sender: ${senderName}
        Message: "${messageContent}"
        CTA Link: ${chatLink}
      `);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `New message from ${senderName} on Tapfere`,
        html: htmlContent,
        text: `Hello ${recipientName},\n\nYou have received a new message from ${senderName}: "${messageContent}"\n\nView this message in the chat: ${chatLink}`,
      });
      this.logger.log(`Email notification successfully sent to ${to}`);
      return true;
    } catch (error) {
      const err = error as any;
      this.logger.error(
        `Failed to send email notification to ${to}:`,
        err?.stack || err,
      );
      return false;
    }
  }

  async sendOnboardingEmail(
    to: string,
    recipientName: string,
    role: 'CLIENT' | 'THERAPIST' | string,
  ): Promise<boolean> {
    const appLink =
      process.env.EMAIL_REDIRECT_URL ||
      `${process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173'}`;

    const isTherapist = role === 'THERAPIST';

    const introText = isTherapist
      ? "Welcome to the Tapfere clinical team! We're excited to have you on board. Your account is ready, and this is your home base for clinical updates, patient assignments, and administrative support."
      : "Welcome to Tapfere! We're so glad you're here. Your account is ready, and you can now connect with your care team, track your progress, and access your physiotherapy resources — all in one place.";

    const highlights = isTherapist
      ? [
          'Manage your assigned patients and clinical conversations',
          'Receive real-time updates and platform announcements',
          'Access administrative support whenever you need it',
        ]
      : [
          'Chat directly and securely with your care team',
          'Follow your personalized physiotherapy plan',
          'Explore resources to support your recovery',
        ];

    const highlightsHtml = highlights
      .map((item) => `<li class="highlight-item">${item}</li>`)
      .join('');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Tapfere</title>
  <style>
    body {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .email-header {
      background: linear-gradient(135deg, #0f172a 0%, #0d9488 100%);
      padding: 32px;
      text-align: center;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .email-body {
      padding: 40px 32px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .intro-text {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .highlight-card {
      background-color: #f1f5f9;
      border-left: 4px solid #14b8a6;
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 32px;
    }
    .highlight-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #0d9488;
      letter-spacing: 0.05em;
      margin: 0 0 12px 0;
    }
    .highlight-list {
      margin: 0;
      padding-left: 20px;
    }
    .highlight-item {
      font-size: 15px;
      line-height: 1.6;
      color: #1e293b;
      margin-bottom: 6px;
    }
    .cta-container {
      text-align: center;
      margin-bottom: 16px;
    }
    .cta-button {
      display: inline-block;
      background-color: #0d9488;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.2);
      transition: background-color 0.2s ease;
    }
    .cta-button:hover {
      background-color: #0f766e;
    }
    .email-footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .email-footer p {
      font-size: 12px;
      color: #94a3b8;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Welcome to Tapfere</h1>
    </div>
    <div class="email-body">
      <p class="greeting">Hello ${recipientName},</p>
      <p class="intro-text">${introText}</p>

      <div class="highlight-card">
        <p class="highlight-title">Here's what you can do</p>
        <ul class="highlight-list">
          ${highlightsHtml}
        </ul>
      </div>

      <div class="cta-container">
        <a href="${appLink}" class="cta-button">Get Started</a>
      </div>
    </div>
    <div class="email-footer">
      <p>This is an automated notification. Please do not reply directly to this email.</p>
      <p>&copy; ${new Date().getFullYear()} Tapfere. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

    const textContent = `Hello ${recipientName},\n\n${introText}\n\nHere's what you can do:\n${highlights
      .map((item) => `- ${item}`)
      .join('\n')}\n\nGet started: ${appLink}`;

    if (!this.transporter) {
      this.logger.log(`[DEV FALLBACK] Simulated Onboarding Email:
        To: ${to} (${recipientName})
        Role: ${role}
        CTA Link: ${appLink}
      `);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: 'Welcome to Tapfere 🌿',
        html: htmlContent,
        text: textContent,
      });
      this.logger.log(`Onboarding email successfully sent to ${to}`);
      return true;
    } catch (error) {
      const err = error as any;
      this.logger.error(
        `Failed to send onboarding email to ${to}:`,
        err?.stack || err,
      );
      return false;
    }
  }

  async sendAccountDeactivationEmail(
    to: string,
    recipientName: string,
  ): Promise<boolean> {
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@tapfere.com';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Tapfere access has been deactivated</title>
  <style>
    body {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .email-header {
      background: linear-gradient(135deg, #0f172a 0%, #475569 100%);
      padding: 32px;
      text-align: center;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .email-body {
      padding: 40px 32px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .intro-text {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .notice-card {
      background-color: #fef2f2;
      border-left: 4px solid #ef4444;
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 32px;
    }
    .notice-text {
      font-size: 15px;
      line-height: 1.6;
      color: #1e293b;
      margin: 0;
    }
    .support-text {
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 8px;
    }
    .support-link {
      color: #0d9488;
      font-weight: 600;
      text-decoration: none;
    }
    .email-footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .email-footer p {
      font-size: 12px;
      color: #94a3b8;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Tapfere</h1>
    </div>
    <div class="email-body">
      <p class="greeting">Hello ${recipientName},</p>
      <p class="intro-text">We're writing to let you know that your access to the Tapfere platform has been deactivated.</p>

      <div class="notice-card">
        <p class="notice-text">Your account has been removed and you will no longer be able to sign in. If you had ongoing physiotherapy care, please reach out so we can help with next steps.</p>
      </div>

      <p class="support-text">If you believe this was a mistake, or you'd like your access restored, please contact us at
        <a href="mailto:${supportEmail}" class="support-link">${supportEmail}</a>.</p>
      <p class="support-text">Thank you for being part of Tapfere.</p>
    </div>
    <div class="email-footer">
      <p>This is an automated notification. Please do not reply directly to this email.</p>
      <p>&copy; ${new Date().getFullYear()} Tapfere. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

    const textContent = `Hello ${recipientName},\n\nWe're writing to let you know that your access to the Tapfere platform has been deactivated. Your account has been removed and you will no longer be able to sign in.\n\nIf you believe this was a mistake, or you'd like your access restored, please contact us at ${supportEmail}.\n\nThank you for being part of Tapfere.`;

    if (!this.transporter) {
      this.logger.log(`[DEV FALLBACK] Simulated Account Deactivation Email:
        To: ${to} (${recipientName})
        Support: ${supportEmail}
      `);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: 'Your Tapfere access has been deactivated',
        html: htmlContent,
        text: textContent,
      });
      this.logger.log(`Account deactivation email successfully sent to ${to}`);
      return true;
    } catch (error) {
      const err = error as any;
      this.logger.error(
        `Failed to send account deactivation email to ${to}:`,
        err?.stack || err,
      );
      return false;
    }
  }
}
