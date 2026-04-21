import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getSheetsClient } from '../../clients.js';
import * as SheetsHelpers from '../../googleSheetsApiHelpers.js';

function colIndexToLetters(index: number): string {
  let s = '';
  let i = index;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

function rgbToHex(rgb: { red?: number; green?: number; blue?: number } | null | undefined): string {
  if (!rgb) return '#000000';
  const r = Math.round((rgb.red ?? 0) * 255);
  const g = Math.round((rgb.green ?? 0) * 255);
  const b = Math.round((rgb.blue ?? 0) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function register(server: FastMCP) {
  server.addTool({
    name: 'getConditionalFormatting',
    description:
      'Lists all conditional formatting rules for a sheet, including their index (needed for deleteConditionalFormatting), condition, ranges, and applied formats.',
    parameters: z.object({
      spreadsheetId: z
        .string()
        .describe(
          'The spreadsheet ID — the long string between /d/ and /edit in a Google Sheets URL.'
        ),
      sheetName: z
        .string()
        .optional()
        .describe('Name of the sheet/tab. Defaults to the first sheet if not provided.'),
    }),
    execute: async (args, { log }) => {
      const sheets = await getSheetsClient();
      log.info(`Getting conditional formatting rules for spreadsheet ${args.spreadsheetId}`);

      try {
        const sheetId = await SheetsHelpers.resolveSheetId(
          sheets,
          args.spreadsheetId,
          args.sheetName
        );

        const response = await sheets.spreadsheets.get({
          spreadsheetId: args.spreadsheetId,
          fields: 'sheets(properties(sheetId,title),conditionalFormats)',
        });

        const sheet = response.data.sheets?.find((s) => s.properties?.sheetId === sheetId);
        const rules = sheet?.conditionalFormats ?? [];

        if (rules.length === 0) {
          return 'No conditional formatting rules found on this sheet.';
        }

        const summary = rules.map((rule, idx) => {
          const condition = rule.booleanRule?.condition ?? rule.gradientRule;
          const fmt = rule.booleanRule?.format ?? {};

          const ranges = (rule.ranges ?? []).map((r) => {
            const startCol =
              r.startColumnIndex != null ? colIndexToLetters(r.startColumnIndex) : '';
            const endCol = r.endColumnIndex != null ? colIndexToLetters(r.endColumnIndex - 1) : '';
            const startRow = r.startRowIndex != null ? r.startRowIndex + 1 : '';
            const endRow = r.endRowIndex != null ? r.endRowIndex : '';
            return `${startCol}${startRow}:${endCol}${endRow}`;
          });

          const condType = (condition as any)?.type ?? 'GRADIENT';
          const condValues = ((condition as any)?.values ?? [])
            .map((v: any) => v.userEnteredValue)
            .join(', ');
          const bg = fmt.backgroundColor;
          const bgColor = bg
            ? rgbToHex({ red: bg.red ?? 0, green: bg.green ?? 0, blue: bg.blue ?? 0 })
            : null;
          const fg = fmt.textFormat?.foregroundColor;
          const fgColor = fg
            ? rgbToHex({ red: fg.red ?? 0, green: fg.green ?? 0, blue: fg.blue ?? 0 })
            : null;

          return [
            `[Rule ${idx}]`,
            `  Ranges: ${ranges.join(', ')}`,
            `  Condition: ${condType}${condValues ? ` = ${condValues}` : ''}`,
            bgColor ? `  Background: ${bgColor}` : null,
            fgColor ? `  Text color: ${fgColor}` : null,
            fmt.textFormat?.bold ? '  Bold: true' : null,
          ]
            .filter(Boolean)
            .join('\n');
        });

        return `Found ${rules.length} conditional formatting rule(s):\n\n${summary.join('\n\n')}`;
      } catch (error: any) {
        log.error(`Error getting conditional formatting: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to get conditional formatting: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
