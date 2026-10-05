import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isAdmin, type User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';

type AuthedRequest = Request & { user?: User; sessionToken?: string };

export function bearerToken(request: Request) {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}

/** Requires `Authorization: Bearer <session token>`; attaches the user to the request. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(request);
    const user = token ? await this.auth.getSessionUser(token) : null;
    if (!user || !token) throw new UnauthorizedException();
    request.user = user;
    request.sessionToken = token;
    return true;
  }
}

/** Like `SessionGuard`, but only lets admins through. */
@Injectable()
export class AdminGuard extends SessionGuard {
  async canActivate(context: ExecutionContext) {
    await super.canActivate(context);
    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!user || !isAdmin(user.role)) throw new ForbiddenException();
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().user,
);

export const SessionToken = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().sessionToken,
);

/** Attaches the user when a valid session is sent, but never rejects the request. */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(request);
    const user = token ? await this.auth.getSessionUser(token) : null;
    if (user && token) {
      request.user = user;
      request.sessionToken = token;
    }
    return true;
  }
}
