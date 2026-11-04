import { describe, expect, it } from 'vitest';
import { createResetToken, hashPassword, hashToken, passwordIssues, verifyPassword } from '../src/utils/password';

describe('kata sandi', () => {
  it('meng-hash dan memverifikasi kata sandi', () => {
    const hash = hashPassword('Rahasia123');
    expect(hash).toMatch(/^scrypt\$/);
    expect(verifyPassword('Rahasia123', hash)).toBe(true);
    expect(verifyPassword('Salah123', hash)).toBe(false);
  });

  it('menghasilkan hash berbeda untuk kata sandi yang sama', () => {
    const first = hashPassword('Rahasia123');
    const second = hashPassword('Rahasia123');
    expect(first).not.toBe(second);
  });

  it('mengembalikan alasan kata sandi lemah', () => {
    expect(passwordIssues('abc')).toContain('Kata sandi minimal 8 karakter.');
    expect(passwordIssues('abcdefgh')).toContain('Kata sandi harus memuat angka.');
    expect(passwordIssues('12345678')).toContain('Kata sandi harus memuat huruf.');
    expect(passwordIssues('Rahasia123')).toHaveLength(0);
  });

  it('membuat token reset dan hash yang konsisten', () => {
    const { token, hash } = createResetToken();
    expect(token).toHaveLength(64);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
  });
});
