import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { hashPassword, hashToken } from './crypto.js';

function setup() {
  const users = {
    findOne: vi.fn(),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) =>
      Promise.resolve({ id: 'u1', role: 'customer', ...data }),
    ),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
  const sessions = {
    findOne: vi.fn(),
    create: vi.fn((d: object) => d),
    save: vi.fn(),
    delete: vi.fn(),
  };
  const resetTokens = {
    findOne: vi.fn(),
    create: vi.fn((d: object) => d),
    save: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  };
  const mail = { sendPasswordReset: vi.fn() };
  const config = { get: vi.fn((_key: string, fallback: string) => fallback) };
  const service = new AuthService(
    users as never,
    sessions as never,
    resetTokens as never,
    mail as never,
    config as never,
  );
  const queryReturning = (user: unknown) =>
    users.createQueryBuilder.mockReturnValue({
      addSelect: () => ({
        where: () => ({ getOne: () => Promise.resolve(user) }),
      }),
    });
  return { service, users, sessions, resetTokens, mail, queryReturning };
}

const signup = {
  fullName: 'Daniel Adebayo',
  email: 'daniel@example.com',
  phone: '+2348034567890',
  password: 'Toxiclean001',
};

describe('AuthService', () => {
  it('signs up, hashes the password and starts a session', async () => {
    const { service, users, sessions } = setup();
    users.findOne.mockResolvedValue(null);
    const result = await service.signup(signup);

    const saved = users.save.mock.calls[0][0] as { passwordHash: string };
    expect(saved.passwordHash).toMatch(/^scrypt\$/);
    expect(saved.passwordHash).not.toContain('Toxiclean001');
    expect(result.user).toEqual({
      id: 'u1',
      fullName: 'Daniel Adebayo',
      email: 'daniel@example.com',
      phone: '+2348034567890',
      role: 'customer',
    });
    // Only the hash of the session token is stored.
    const session = sessions.save.mock.calls[0][0] as { tokenHash: string };
    expect(session.tokenHash).toBe(hashToken(result.token));
  });

  it('rejects a duplicate email', async () => {
    const { service, users } = setup();
    users.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.signup(signup)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('logs in with the right password only', async () => {
    const { service, queryReturning } = setup();
    queryReturning({
      id: 'u1',
      ...signup,
      role: 'customer',
      passwordHash: await hashPassword('Toxiclean001'),
    });
    await expect(
      service.login({ email: signup.email, password: 'Toxiclean001' }),
    ).resolves.toHaveProperty('token');
    await expect(
      service.login({ email: signup.email, password: 'Wrong1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('gives the same error for an unknown email', async () => {
    const { service, queryReturning } = setup();
    queryReturning(null);
    await expect(
      service.login({ email: 'nobody@example.com', password: 'Whatever1' }),
    ).rejects.toThrow('Incorrect email or password.');
  });

  it('does not reveal whether an email is registered when resetting', async () => {
    const { service, users, mail } = setup();
    users.findOne.mockResolvedValue(null);
    await expect(
      service.requestPasswordReset('nobody@example.com'),
    ).resolves.toBeUndefined();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('emails a single-use reset link for a registered email', async () => {
    const { service, users, resetTokens, mail } = setup();
    users.findOne.mockResolvedValue({
      id: 'u1',
      email: signup.email,
      fullName: signup.fullName,
      language: 'fr',
    });
    await service.requestPasswordReset(signup.email);
    expect(resetTokens.delete).toHaveBeenCalled();
    const [to, link, language] = mail.sendPasswordReset.mock.calls[0] as [
      { email: string },
      string,
      string,
    ];
    expect(to.email).toBe(signup.email);
    expect(language).toBe('fr');
    const token = new URL(link).searchParams.get('token') ?? '';
    // The account's language is French, so the link opens the French page.
    expect(link).toMatch(
      /^http:\/\/localhost:4000\/fr\/reset-password\?token=/,
    );
    expect(
      (resetTokens.save.mock.calls[0][0] as { tokenHash: string }).tokenHash,
    ).toBe(hashToken(token));
  });

  it('resets the password, uses up the token and signs out everywhere', async () => {
    const { service, users, sessions, resetTokens } = setup();
    resetTokens.findOne.mockResolvedValue({ id: 't1', user: { id: 'u1' } });
    await service.resetPassword('token', 'NewPassword1');
    expect(users.update).toHaveBeenCalledWith('u1', {
      passwordHash: expect.stringMatching(/^scrypt\$/),
    });
    expect(resetTokens.update).toHaveBeenCalledWith('t1', {
      usedAt: expect.any(Date),
    });
    expect(sessions.delete).toHaveBeenCalledWith({ user: { id: 'u1' } });
  });

  it('rejects an invalid or expired reset token', async () => {
    const { service, resetTokens } = setup();
    resetTokens.findOne.mockResolvedValue(null);
    await expect(
      service.resetPassword('bad', 'NewPassword1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthService.changePassword', () => {
  it('rejects a wrong current password', async () => {
    const { service, queryReturning } = setup();
    queryReturning({
      id: 'u1',
      passwordHash: await hashPassword('Toxiclean001'),
    });
    await expect(
      service.changePassword('u1', 'Wrong1234', 'NewPassword1', 'tok'),
    ).rejects.toThrow('Your current password is incorrect.');
  });

  it('updates the password and signs out other sessions only', async () => {
    const { service, users, sessions, queryReturning } = setup();
    queryReturning({
      id: 'u1',
      passwordHash: await hashPassword('Toxiclean001'),
    });
    await service.changePassword(
      'u1',
      'Toxiclean001',
      'NewPassword1',
      'current-token',
    );
    expect(users.update).toHaveBeenCalledWith('u1', {
      passwordHash: expect.stringMatching(/^scrypt\$/),
    });
    const [criteria] = sessions.delete.mock.calls[0] as [
      { user: { id: string }; tokenHash: { _value: string } },
    ];
    expect(criteria.user).toEqual({ id: 'u1' });
    expect(criteria.tokenHash._value).toBe(hashToken('current-token'));
  });
});
