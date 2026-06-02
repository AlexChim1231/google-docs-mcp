import { describe, it, expect } from 'vitest';
import {
  looksLikeMarkdownStructuredContent,
  normalizeEscapedWhitespace,
} from './textContentGuards.js';

describe('textContentGuards', () => {
  describe('normalizeEscapedWhitespace', () => {
    it('should convert literal \\n sequences to newlines', () => {
      expect(normalizeEscapedWhitespace('line1\\nline2')).toBe('line1\nline2');
    });
  });

  describe('looksLikeMarkdownStructuredContent', () => {
    it('should detect numbered lists with real newlines', () => {
      const text = '1. First item\n2. Second item\n3. Third item';
      expect(looksLikeMarkdownStructuredContent(text)).toBe(true);
    });

    it('should detect numbered lists with escaped newlines', () => {
      const text = '1. First item\\n2. Second item\\n3. Third item';
      expect(looksLikeMarkdownStructuredContent(text)).toBe(true);
    });

    it('should detect bullet lists', () => {
      const text = '- Alpha\n- Beta';
      expect(looksLikeMarkdownStructuredContent(text)).toBe(true);
    });

    it('should detect markdown headings', () => {
      expect(looksLikeMarkdownStructuredContent('## Section title')).toBe(true);
    });

    it('should detect markdown bold', () => {
      expect(looksLikeMarkdownStructuredContent('This is **bold** text')).toBe(true);
    });

    it('should allow plain single-line text', () => {
      expect(looksLikeMarkdownStructuredContent('Approved settlement amount: HKD 5,000')).toBe(
        false
      );
    });

    it('should allow a single numbered reference line', () => {
      expect(looksLikeMarkdownStructuredContent('See section 1. Overview for details.')).toBe(
        false
      );
    });
  });
});
