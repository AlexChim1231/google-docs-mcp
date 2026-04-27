import { describe, expect, it } from 'vitest';
import { buildReplaceTableCellContentRequests } from './tableRowDataHelpers.js';

describe('buildReplaceTableCellContentRequests', () => {
  it('builds delete + insert requests for a populated cell', () => {
    const requests = buildReplaceTableCellContentRequests(
      {
        rowIndex: 1,
        columnIndex: 2,
        startIndex: 100,
        endIndex: 120,
        contentStartIndex: 101,
        contentEndIndex: 110,
        text: 'Old value',
      },
      'New value'
    );

    expect(requests).toHaveLength(2);
    expect(requests[0].deleteContentRange?.range).toEqual({
      startIndex: 101,
      endIndex: 109,
    });
    expect(requests[1].insertText?.location?.index).toBe(101);
    expect(requests[1].insertText?.text).toBe('New value');
  });

  it('builds insert-only requests for an empty cell with a writable content index', () => {
    const requests = buildReplaceTableCellContentRequests(
      {
        rowIndex: 0,
        columnIndex: 0,
        startIndex: 50,
        endIndex: 60,
        contentStartIndex: 51,
        contentEndIndex: 52,
        text: '',
      },
      'Value'
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].insertText?.location?.index).toBe(51);
    expect(requests[0].insertText?.text).toBe('Value');
  });

  it('builds delete-only requests when replacing with an empty string', () => {
    const requests = buildReplaceTableCellContentRequests(
      {
        rowIndex: 0,
        columnIndex: 1,
        startIndex: 70,
        endIndex: 90,
        contentStartIndex: 71,
        contentEndIndex: 75,
        text: 'ABC',
      },
      ''
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].deleteContentRange?.range).toEqual({
      startIndex: 71,
      endIndex: 74,
    });
  });
});
