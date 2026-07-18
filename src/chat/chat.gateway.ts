import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // userId -> set of live socket ids. A user is "online" while this set is non-empty.
  private readonly online = new Map<string, Set<string>>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  private isOnline(userId: string): boolean {
    return (this.online.get(userId)?.size ?? 0) > 0;
  }

  private verify(
    client: Socket,
  ): { userId: string; role: string } | null {
    const token =
      client.handshake.auth?.token ||
      (client.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return null;
    try {
      const payload: any = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'super_secret',
      });
      if (!payload?.sub) return null;
      return { userId: payload.sub, role: payload.role };
    } catch {
      return null;
    }
  }

  async handleConnection(client: Socket) {
    const identity = this.verify(client);
    if (!identity) {
      client.disconnect(true);
      return;
    }
    const { userId, role } = identity;
    client.data.userId = userId;
    client.data.role = role;

    const wasOffline = !this.isOnline(userId);
    const sockets = this.online.get(userId) ?? new Set<string>();
    sockets.add(client.id);
    this.online.set(userId, sockets);

    // Personal room lets us target a user across all their tabs/devices.
    client.join(`user:${userId}`);

    if (wasOffline) {
      this.server.emit('presence', { userId, online: true, lastSeen: null });
    }

    // Anything addressed to this user that was still "sent" is now delivered.
    try {
      const delivered = await this.chatService.markIncomingDelivered(userId);
      const byConversation = new Map<string, string[]>();
      for (const m of delivered) {
        const list = byConversation.get(m.conversationId) ?? [];
        list.push(m.id);
        byConversation.set(m.conversationId, list);
      }
      for (const [conversationId, messageIds] of byConversation) {
        this.server.to(conversationId).emit('messageStatus', {
          conversationId,
          status: 'DELIVERED',
          messageIds,
        });
      }
    } catch (err) {
      this.logger.error('Failed to mark incoming delivered on connect', err);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId: string | undefined = client.data?.userId;
    if (!userId) return;

    const sockets = this.online.get(userId);
    sockets?.delete(client.id);

    if (!sockets || sockets.size === 0) {
      this.online.delete(userId);
      await this.chatService.setUserOffline(userId);
      const lastSeen = await this.chatService.getLastSeen(userId);
      this.server.emit('presence', {
        userId,
        online: false,
        lastSeen: lastSeen ?? new Date(),
      });
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(conversationId);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody()
    payload: { conversationId: string; content: string; senderId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Identity comes from the verified token, never from the payload — except
    // an ADMIN may send on behalf of another user (e.g. the support channel).
    const authId: string | undefined = client.data?.userId;
    if (!authId) return;
    const senderId =
      client.data?.role === 'ADMIN' && payload.senderId
        ? payload.senderId
        : authId;

    const message = await this.chatService.createMessage(
      payload.conversationId,
      senderId,
      payload.content,
    );
    this.server.to(payload.conversationId).emit('newMessage', message);

    // If the recipient is currently connected, the message is delivered right away.
    const participants = await this.chatService.getParticipants(
      payload.conversationId,
    );
    if (participants) {
      const recipientId =
        participants.clientId === senderId
          ? participants.therapistId
          : participants.clientId;
      if (this.isOnline(recipientId)) {
        await this.chatService.markMessagesDelivered([message.id]);
        this.server.to(payload.conversationId).emit('messageStatus', {
          conversationId: payload.conversationId,
          status: 'DELIVERED',
          messageIds: [message.id],
        });
      }
    }

    return message;
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(
    @MessageBody() payload: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const readerId: string | undefined = client.data?.userId;
    if (!readerId || !payload?.conversationId) return;

    const messageIds = await this.chatService.markConversationRead(
      payload.conversationId,
      readerId,
    );
    if (messageIds.length > 0) {
      this.server.to(payload.conversationId).emit('messageStatus', {
        conversationId: payload.conversationId,
        status: 'READ',
        messageIds,
        readerId,
      });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() payload: { conversationId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const userId: string | undefined = client.data?.userId;
    if (!userId || !payload?.conversationId) return;
    // Broadcast to everyone else in the room (not back to the typer).
    client.to(payload.conversationId).emit('typing', {
      conversationId: payload.conversationId,
      userId,
      isTyping: !!payload.isTyping,
    });
  }

  @SubscribeMessage('getPresence')
  async handleGetPresence(@MessageBody() userId: string) {
    const online = this.isOnline(userId);
    const lastSeen = online ? null : await this.chatService.getLastSeen(userId);
    return { userId, online, lastSeen };
  }
}
