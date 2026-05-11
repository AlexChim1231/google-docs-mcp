import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DOCUMENT_GET_FULL_WITH_TABS } from '../../docsFieldMasks.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { getTableById } from './structureHelpers.js';

const MAX_BATCH_UPDATE_REQUESTS = 50;

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertTableRow',
    description:
      'Inserts one or more empty rows into a Google Docs table using insertTableRow (InsertTableRowRequest). Rows are created relative to a reference row; fill cells with replaceTableRowData or appendTableRows_docs.',
    parameters: DocumentIdParameter.extend({
      tableId: z
        .string()
        .min(1)
        .describe('The MCP table ID from listDocumentTables, for example "table:body:0".'),
      referenceRowIndex: z
        .number()
        .int()
        .min(0)
        .describe(
          'Zero-based index of the reference row. New empty row(s) are inserted immediately above or below this row (see insertBelow).'
        ),
      insertBelow: z
        .boolean()
        .describe(
          'If true, inserts below the reference row. If false, inserts above the reference row.'
        ),
      columnIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Zero-based column index of the anchor cell (default 0). Use another column when the anchor cell must match merged table layout.'
        ),
      insertCount: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Number of empty rows to insert in one operation (default 1).'),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the tab containing the table. If omitted, uses the first tab or legacy document body.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const insertCount = args.insertCount ?? 1;
      const columnIndex = args.columnIndex ?? 0;

      log.info(
        `insertTableRow: ${insertCount} row(s) ${args.insertBelow ? 'below' : 'above'} reference row ${args.referenceRowIndex} in ${args.tableId}, doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields: DOCUMENT_GET_FULL_WITH_TABS,
        });

        const table = getTableById(res.data, args.tableId, args.tabId);
        if (!table) {
          throw new UserError(`Table "${args.tableId}" not found in document.`);
        }
        if (table.startIndex == null) {
          throw new UserError(`Table "${args.tableId}" does not expose a valid table start index.`);
        }
        if (args.referenceRowIndex >= table.rowCount) {
          throw new UserError(
            `referenceRowIndex ${args.referenceRowIndex} is out of range; table has ${table.rowCount} row(s) (valid indices: 0..${table.rowCount - 1}).`
          );
        }
        if (columnIndex >= table.columnCount) {
          throw new UserError(
            `columnIndex ${columnIndex} is out of range; table has ${table.columnCount} column(s) (valid indices: 0..${table.columnCount - 1}).`
          );
        }

        const requests = Array.from({ length: insertCount }, () =>
          GDocsHelpers.buildInsertTableRowRequest(
            table.startIndex,
            args.referenceRowIndex,
            args.insertBelow,
            args.tabId,
            columnIndex
          )
        );

        for (let i = 0; i < requests.length; i += MAX_BATCH_UPDATE_REQUESTS) {
          const batch = requests.slice(i, i + MAX_BATCH_UPDATE_REQUESTS);
          await GDocsHelpers.executeBatchUpdate(docs, args.documentId, batch);
        }

        return `Inserted ${insertCount} empty row(s) ${args.insertBelow ? 'below' : 'above'} row ${args.referenceRowIndex} in table ${args.tableId}.`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`insertTableRow failed for ${args.tableId} in doc ${args.documentId}: ${message}`);
        if (error instanceof UserError) throw error;
        const errAny = error as { code?: number };
        if (errAny.code === 404) throw new UserError(`Document not found (ID: ${args.documentId}).`);
        if (errAny.code === 403)
          throw new UserError(`Permission denied for document (ID: ${args.documentId}).`);
        throw new UserError(`Failed to insert table row(s): ${message || 'Unknown error'}`);
      }
    },
  });
}
