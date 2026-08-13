import { describe, it, expect } from 'vitest';

import { contactDisplayName, resolvePickedContactName } from './contact-display-name';

describe('contactDisplayName', () => {
  it('returns the full name when present', () => {
    expect(contactDisplayName({ name: 'Sou Meng' })).toBe('Sou Meng');
  });

  it('composes first + last when name is absent', () => {
    expect(contactDisplayName({ firstName: 'Sou', lastName: 'Meng' })).toBe('Sou Meng');
  });

  it('uses first name alone / last name alone', () => {
    expect(contactDisplayName({ firstName: 'Sou' })).toBe('Sou');
    expect(contactDisplayName({ lastName: 'Meng' })).toBe('Meng');
  });

  it('trims surrounding whitespace', () => {
    expect(contactDisplayName({ name: '  Sou  ' })).toBe('Sou');
    expect(contactDisplayName({ firstName: '  Sou ', lastName: ' Meng ' })).toBe('Sou Meng');
  });

  it('falls back to composed name when name is whitespace-only', () => {
    expect(contactDisplayName({ name: '   ', firstName: 'Sou', lastName: 'Meng' })).toBe('Sou Meng');
  });

  it('returns "" for null / undefined / nameless contact', () => {
    expect(contactDisplayName(null)).toBe('');
    expect(contactDisplayName(undefined)).toBe('');
    expect(contactDisplayName({})).toBe('');
    expect(contactDisplayName({ name: '', firstName: '', lastName: '' })).toBe('');
  });

  it('drops every non-name field at the boundary — name only, nothing else leaks', () => {
    // Simulates the raw expo-contacts Contact (phone/email/id/photo present).
    const picked = {
      name: 'Sou',
      firstName: 'Sou',
      lastName: '',
      phoneNumbers: [{ number: '+33612345678' }],
      emails: [{ email: 'sou@example.com' }],
      id: 'contact-abc-123',
      image: { uri: 'file:///photo.jpg' },
    };
    const out = contactDisplayName(picked as never);
    expect(out).toBe('Sou');
    expect(out).not.toContain('+33');
    expect(out).not.toContain('@');
    expect(out).not.toContain('contact-abc-123');
    expect(out).not.toContain('photo');
  });
});

describe('resolvePickedContactName', () => {
  it('successful selection → the name to apply', () => {
    expect(resolvePickedContactName({ name: 'Sou' })).toBe('Sou');
    expect(resolvePickedContactName({ firstName: 'Sou', lastName: 'Meng' })).toBe('Sou Meng');
  });

  it('cancellation (null/undefined) → null → caller makes no state change', () => {
    expect(resolvePickedContactName(null)).toBeNull();
    expect(resolvePickedContactName(undefined)).toBeNull();
  });

  it('picked contact with no usable name → null (no-op, not an empty label)', () => {
    expect(resolvePickedContactName({ name: '', firstName: '', lastName: '' })).toBeNull();
  });
});
