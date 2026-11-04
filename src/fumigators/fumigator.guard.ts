import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import type { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import type { User } from '../users/user.entity.js';
import { Fumigator } from './fumigator.entity.js';

type PortalRequest = Request & { user?: User; fumigator?: Fumigator };

/**
 * Like `SessionGuard`, but only lets in a `fumigator` account linked to an active
 * fumigator; attaches that fumigator to the request.
 */
@Injectable()
export class FumigatorGuard extends SessionGuard {
  constructor(
    auth: AuthService,
    @InjectRepository(Fumigator)
    private readonly fumigators: Repository<Fumigator>,
  ) {
    super(auth);
  }

  async canActivate(context: ExecutionContext) {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<PortalRequest>();
    if (request.user?.role !== 'fumigator') throw new ForbiddenException();
    const fumigator = await this.fumigators.findOne({
      where: { user: { id: request.user.id } },
    });
    if (!fumigator?.active) {
      throw new ForbiddenException(
        'Your fumigator profile is inactive. Please contact the office.',
      );
    }
    request.fumigator = fumigator;
    return true;
  }
}

export const CurrentFumigator = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<PortalRequest>().fumigator,
);
