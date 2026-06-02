const NUMBERED_LIST_LINE = /^\s*\d+\.\s+\S/;
const BULLET_LIST_LINE = /^\s*[-*+]\s+\S/;
const MARKDOWN_HEADING = /^\s*#{1,6}\s+\S/m;
const MARKDOWN_BOLD = /\*\*[^*]+\*\*/;

export const PLAIN_TEXT_TOOL_MARKDOWN_ERROR =
  'Content looks like formatted markdown (lists, headings, or bold). Plain-text tools insert characters literally. Use replaceRangeWithMarkdown or appendMarkdown instead; use readDocument with format="json" when you need range indices.';

/** Models sometimes send literal backslash-n instead of real newlines. */
export function normalizeEscapedWhitespace(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export function looksLikeMarkdownStructuredContent(text: string): boolean {
  const normalized = normalizeEscapedWhitespace(text);
  const lines = normalized.split('\n');

  const numberedLines = lines.filter((line) => NUMBERED_LIST_LINE.test(line));
  if (numberedLines.length >= 2) {
    return true;
  }

  const bulletLines = lines.filter((line) => BULLET_LIST_LINE.test(line));
  if (bulletLines.length >= 2) {
    return true;
  }

  if (MARKDOWN_HEADING.test(normalized)) {
    return true;
  }

  if (MARKDOWN_BOLD.test(normalized)) {
    return true;
  }

  return false;
}
