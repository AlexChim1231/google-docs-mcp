import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDriveClient } from '../../clients.js';
import { register } from './listGoogleSheets.js';

vi.mock('../../clients.js', () => ({
  getDriveClient: vi.fn(),
}));

const mockGetDriveClient = vi.mocked(getDriveClient);
const mockLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
let toolExecute: (args: any, context: any) => Promise<string>;
let filesList: ReturnType<typeof vi.fn>;

describe('listGoogleSheets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filesList = vi.fn(async () => ({ data: { files: [] } }));
    mockGetDriveClient.mockResolvedValue({ files: { list: filesList } } as any);

    const fakeServer = { addTool: (config: any) => (toolExecute = config.execute) };
    register(fakeServer as any);
  });

  it('escapes query text before interpolating it into the Drive query', async () => {
    await toolExecute(
      {
        query: "Bob's \\ budget",
        maxResults: 10,
        orderBy: 'modifiedTime',
      },
      { log: mockLog }
    );

    const request = filesList.mock.calls[0][0];
    expect(request.q).toContain("name contains 'Bob\\'s \\\\ budget'");
    expect(request.q).toContain("fullText contains 'Bob\\'s \\\\ budget'");
  });
});
