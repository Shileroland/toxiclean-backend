import { verifyPassword } from './crypto.js';
import { SuperAdminSeeder } from './super-admin.seeder.js';

function setup(
  env: Record<string, string>,
  state: { hasSuper?: boolean; existing?: object } = {},
) {
  const users = {
    exists: vi.fn(() => Promise.resolve(state.hasSuper ?? false)),
    findOne: vi.fn(() => Promise.resolve(state.existing ?? null)),
    update: vi.fn(() => Promise.resolve()),
    create: vi.fn((data: object) => data),
    save: vi.fn((data: object) => Promise.resolve(data)),
  };
  const auth = { requestPasswordReset: vi.fn(() => Promise.resolve()) };
  const config = { get: (key: string) => env[key] };
  const seeder = new SuperAdminSeeder(
    users as never,
    auth as never,
    config as never,
  );
  return { seeder, users, auth };
}

describe('SuperAdminSeeder', () => {
  it('does nothing without SUPER_ADMIN_EMAIL or once a super admin exists', async () => {
    const none = setup({});
    await none.seeder.onApplicationBootstrap();
    expect(none.users.exists).not.toHaveBeenCalled();

    const seeded = setup({ SUPER_ADMIN_EMAIL: 'a@b.co' }, { hasSuper: true });
    await seeded.seeder.onApplicationBootstrap();
    expect(seeded.users.save).not.toHaveBeenCalled();
    expect(seeded.users.update).not.toHaveBeenCalled();
  });

  it('promotes an existing account without touching its password', async () => {
    const { seeder, users } = setup(
      {
        SUPER_ADMIN_EMAIL: ' Owner@Example.com ',
        SUPER_ADMIN_PASSWORD: 'Secret123',
      },
      { existing: { id: 'u1' } },
    );
    await seeder.onApplicationBootstrap();
    expect(users.findOne).toHaveBeenCalledWith({
      where: { email: 'owner@example.com' },
    });
    expect(users.update).toHaveBeenCalledWith('u1', { role: 'super_admin' });
    expect(users.save).not.toHaveBeenCalled();
  });

  it('creates the account with the configured password', async () => {
    const { seeder, users, auth } = setup({
      SUPER_ADMIN_EMAIL: 'owner@example.com',
      SUPER_ADMIN_PASSWORD: 'Secret123',
    });
    await seeder.onApplicationBootstrap();
    const saved = users.save.mock.calls[0][0] as {
      role: string;
      passwordHash: string;
    };
    expect(saved.role).toBe('super_admin');
    await expect(verifyPassword('Secret123', saved.passwordHash)).resolves.toBe(
      true,
    );
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('emails a set-password link when no password is configured', async () => {
    const { seeder, users, auth } = setup({
      SUPER_ADMIN_EMAIL: 'owner@example.com',
    });
    await seeder.onApplicationBootstrap();
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: null }),
    );
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('owner@example.com');
  });

  it('refuses a weak password', async () => {
    const { seeder, users } = setup({
      SUPER_ADMIN_EMAIL: 'owner@example.com',
      SUPER_ADMIN_PASSWORD: 'weak',
    });
    await seeder.onApplicationBootstrap();
    expect(users.save).not.toHaveBeenCalled();
  });
});
