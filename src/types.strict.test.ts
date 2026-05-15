import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DocumentIdParameter } from './types.js';

describe('shared tool parameter schemas', () => {
  it('rejects unknown top-level keys', () => {
    const result = DocumentIdParameter.safeParse({
      documentId: 'doc-123',
      folderId: 'wrong-key',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
      expect(result.error.issues[0]).toMatchObject({ keys: ['folderId'] });
    }
  });

  it('keeps strict mode when shared schemas are extended by tools', () => {
    const extended = DocumentIdParameter.extend({
      title: z.string(),
    });

    const result = extended.safeParse({
      documentId: 'doc-123',
      title: 'Report',
      folderId: 'wrong-key',
    });

    expect(result.success).toBe(false);
  });
});
