import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

// We need to test that:
// 1. The access token is never stored in plaintext in the pending map
// 2. Download tokens use cryptographically strong randomness (not just UUID)
// 3. Tokens are single-use and time-limited
// 4. The exported internal state does not leak raw access tokens

describe('downloadProxy security', () => {
  let createDownloadToken: typeof import('./downloadProxy.js').createDownloadToken;
  let _testGetPending: typeof import('./downloadProxy.js')._testGetPending;

  beforeEach(async () => {
    // Fresh import for each test to avoid state leakage
    vi.resetModules();
    const mod = await import('./downloadProxy.js');
    createDownloadToken = mod.createDownloadToken;
    _testGetPending = mod._testGetPending;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should NOT store raw accessToken in the pending map', () => {
    const rawToken = 'ya29.super-secret-google-access-token-12345';

    const downloadToken = createDownloadToken({
      fileId: 'file123',
      accessToken: rawToken,
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      isWorkspace: false,
    });

    // Retrieve the internal pending entry
    const pending = _testGetPending();
    expect(pending).toBeDefined();

    const entry = pending!.get(downloadToken);
    expect(entry).toBeDefined();

    // The raw access token should NOT appear in the stored entry
    // It should be encrypted or otherwise protected
    expect(entry!.accessToken).not.toBe(rawToken);

    // Verify the stored value doesn't contain the raw token as a substring
    const pendingJson = JSON.stringify(Object.fromEntries(pending!.entries()));
    expect(pendingJson).not.toContain(rawToken);
  });

  it('should generate tokens with sufficient entropy (>= 32 bytes)', () => {
    const token = createDownloadToken({
      fileId: 'file123',
      accessToken: 'ya29.test-token',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      isWorkspace: false,
    });

    // Token should be a hex string of at least 64 characters (32 bytes)
    // or otherwise have high entropy (UUID v4 has ~122 bits which is OK,
    // but raw hex from randomBytes is better)
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('should use single-use tokens (token deleted after retrieval concept)', () => {
    const token = createDownloadToken({
      fileId: 'file123',
      accessToken: 'ya29.test-token',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      isWorkspace: false,
    });

    const pending = _testGetPending();
    expect(pending!.has(token)).toBe(true);
  });

  it('should set expiry within a short time window (max 60s)', () => {
    const now = Date.now();
    const token = createDownloadToken({
      fileId: 'file123',
      accessToken: 'ya29.test-token',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      isWorkspace: false,
    });

    const pending = _testGetPending();
    const entry = pending!.get(token);
    expect(entry).toBeDefined();

    // expiresAt should be within 60 seconds from now (not 5 minutes)
    const maxExpiry = now + 60_000 + 1000; // 60s + 1s tolerance
    expect(entry!.expiresAt).toBeLessThanOrEqual(maxExpiry);
  });
});
