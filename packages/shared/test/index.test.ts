import { describe, expect, it } from 'vitest';
import { ReleaseSchema, ReleaseStatus } from '../src/index.js';

describe('ReleaseSchema', () => {
  it('parses a valid release', () => {
    const result = ReleaseSchema.safeParse({
      id: '1',
      name: 'v1.0.0',
      status: ReleaseStatus.DRAFT,
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const result = ReleaseSchema.safeParse({
      id: '1',
      name: 'v1.0.0',
      status: 'not-a-real-status',
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});
