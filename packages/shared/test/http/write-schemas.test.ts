import { describe, expect, it } from 'vitest';
import {
  CreateCommentRequestSchema,
  CreateReleaseRequestSchema,
  LoginRequestSchema,
  PatchReleaseRequestSchema,
  SessionUserSchema,
  TransitionRequestSchema,
} from '../../src/index.js';

describe('CreateReleaseRequestSchema', () => {
  it('accepts a full body', () => {
    const result = CreateReleaseRequestSchema.safeParse({
      releaseLabel: 'payments-api@v1.3.0',
      title: 'Payments API 1.3.0',
      description: 'Adds retry support',
      serviceName: 'payments-api',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null description', () => {
    const result = CreateReleaseRequestSchema.safeParse({
      releaseLabel: 'payments-api@v1.3.0',
      title: 'Payments API 1.3.0',
      description: null,
      serviceName: 'payments-api',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing releaseLabel', () => {
    const result = CreateReleaseRequestSchema.safeParse({
      title: 'Payments API 1.3.0',
      serviceName: 'payments-api',
    });
    expect(result.success).toBe(false);
  });
});

describe('PatchReleaseRequestSchema', () => {
  it('accepts a single changed field plus expectedVersion', () => {
    const result = PatchReleaseRequestSchema.safeParse({ title: 'New title', expectedVersion: 1 });
    expect(result.success).toBe(true);
  });

  it('rejects a body with no title/description/serviceName', () => {
    const result = PatchReleaseRequestSchema.safeParse({ expectedVersion: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing expectedVersion', () => {
    const result = PatchReleaseRequestSchema.safeParse({ title: 'New title' });
    expect(result.success).toBe(false);
  });
});

describe('TransitionRequestSchema', () => {
  it('accepts a transition without a reason', () => {
    const result = TransitionRequestSchema.safeParse({ to: 'submitted', expectedVersion: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts a transition with a reason', () => {
    const result = TransitionRequestSchema.safeParse({
      to: 'rejected',
      reason: 'Failing smoke tests',
      expectedVersion: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = TransitionRequestSchema.safeParse({ to: 'not-a-status', expectedVersion: 1 });
    expect(result.success).toBe(false);
  });
});

describe('CreateCommentRequestSchema', () => {
  it('accepts a non-empty body', () => {
    expect(CreateCommentRequestSchema.safeParse({ body: 'Looks good' }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(CreateCommentRequestSchema.safeParse({ body: '' }).success).toBe(false);
  });
});

describe('LoginRequestSchema', () => {
  it('accepts an email/password pair', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@example.com', password: 'hunter2' }).success).toBe(true);
  });

  it('rejects a non-email', () => {
    expect(LoginRequestSchema.safeParse({ email: 'not-an-email', password: 'hunter2' }).success).toBe(false);
  });
});

describe('SessionUserSchema', () => {
  it('requires an email, unlike UserSummarySchema', () => {
    const result = SessionUserSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ada Lovelace',
      role: 'engineer',
      email: 'ada@example.com',
    });
    expect(result.success).toBe(true);
  });
});
