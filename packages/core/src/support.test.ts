import { describe, expect, it } from 'vitest';
import { remainingLabel, supportAccessState, supportRequestSchema } from './support';

const NOW = '2026-11-12T15:00:00Z';

describe('acceso de soporte', () => {
  it('una aprobación vigente está activa; vencida ya no', () => {
    expect(supportAccessState({ status: 'approved', expiresAt: '2026-11-12T16:00:00Z' }, NOW)).toBe('active');
    expect(supportAccessState({ status: 'approved', expiresAt: '2026-11-12T14:59:00Z' }, NOW)).toBe('expired');
    expect(supportAccessState({ status: 'approved', expiresAt: NOW }, NOW)).toBe('expired');
  });

  it('los demás estados se muestran tal cual, y sin solicitud no hay acceso', () => {
    expect(supportAccessState({ status: 'pending', expiresAt: null }, NOW)).toBe('pending');
    expect(supportAccessState({ status: 'revoked', expiresAt: NOW }, NOW)).toBe('revoked');
    expect(supportAccessState(null, NOW)).toBe('none');
  });

  it('describe el tiempo restante en palabras simples', () => {
    expect(remainingLabel('2026-11-12T15:00:30Z', NOW)).toBe('menos de 1 min');
    expect(remainingLabel('2026-11-12T15:45:00Z', NOW)).toBe('45 min');
    expect(remainingLabel('2026-11-12T18:20:00Z', NOW)).toBe('3 h 20 min');
    expect(remainingLabel('2026-11-12T17:00:00Z', NOW)).toBe('2 h');
    expect(remainingLabel('2026-11-15T17:00:00Z', NOW)).toBe('3 d 2 h');
  });

  it('valida el motivo y la duración de la solicitud', () => {
    const base = { businessId: '00000000-0000-4000-8000-000000000000', reason: 'Revisar horarios', hours: '24' };
    expect(supportRequestSchema.parse(base).hours).toBe(24);
    expect(supportRequestSchema.safeParse({ ...base, reason: 'hey' }).success).toBe(false);
    expect(supportRequestSchema.safeParse({ ...base, hours: '200' }).success).toBe(false);
  });
});
