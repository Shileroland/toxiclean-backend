import {
  generateToken,
  hashPassword,
  hashToken,
  PASSWORD_RULE,
  verifyPassword,
} from './crypto.js';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('Toxiclean001');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    await expect(verifyPassword('Toxiclean001', hash)).resolves.toBe(true);
    await expect(verifyPassword('toxiclean001', hash)).resolves.toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('Same1234')).not.toBe(
      await hashPassword('Same1234'),
    );
  });

  it('rejects malformed hashes', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });
});

describe('tokens', () => {
  it('are random and hash deterministically', () => {
    const a = generateToken();
    expect(a).not.toBe(generateToken());
    expect(hashToken(a)).toHaveLength(64);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});

describe('PASSWORD_RULE', () => {
  it.each([
    ['Toxiclean001', true],
    ['Abcdefg1', true],
    ['short1A', false],
    ['nouppercase1', false],
    ['NoNumberHere', false],
  ])('%s -> %s', (password, valid) => {
    expect(PASSWORD_RULE.test(password)).toBe(valid);
  });
});
