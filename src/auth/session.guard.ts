import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../users/user.entity.js';
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
