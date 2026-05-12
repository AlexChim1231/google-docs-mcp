import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DOCUMENT_GET_FULL_WITH_TABS } from '../../docsFieldMasks.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { getTableById } from './structureHelpers.js';
import { replaceTableRowData as replaceTableRowDataInternal } from './tableRowDataHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertTableRow',
    description:
      'Inserts one or more rows into a Google Docs table relative to a reference row. Pass optional `rows` (plain-text per cell, same shape as appendTableRows_docs) to insert and fill at that index; omit `rows` and use insertCount for empty rows.',
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
          'Zero-based index of the reference row. New row(s) are inserted immediately above or below this row (see insertBelow).'
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
        .describe(
          'Number of empty rows to insert (default 1). Ignored when `rows` is provided; insert count is then rows.length.'
        ),
      rows: z
        .array(z.array(z.string()).max(50))
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Optional: one logical row per inner array (plain-text cell values). Same format as appendTableRows_docs. When set, that many rows are inserted at the reference position and filled.'
        ),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the tab containing the table. If omitted, uses the first tab or legacy document body.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const columnIndex = args.columnIndex ?? 0;
      const rowCountToInsert = args.rows?.length ?? args.insertCount ?? 1;

      log.info(
        `insertTableRow: ${rowCountToInsert} row(s) ${args.insertBelow ? 'below' : 'above'} reference row ${args.referenceRowIndex} in ${args.tableId}, doc ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}${args.rows ? ' (with cell data)' : ''}`
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
        const tableStartIndex = table.startIndex;
        if (tableStartIndex == null) {
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

        if (args.rows) {
          for (const [offset, rowValues] of args.rows.entries()) {
            if (rowValues.length > table.columnCount) {
              throw new UserError(
                `Row ${offset} has ${rowValues.length} values, but table ${args.tableId} only has ${table.columnCount} columns.`
              );
            }
          }
        }

        const insertRequests = Array.from({ length: rowCountToInsert }, () =>
          GDocsHelpers.buildInsertTableRowRequest(
            tableStartIndex,
            args.referenceRowIndex,
            args.insertBelow,
            args.tabId,
            columnIndex
          )
        );

        await GDocsHelpers.executeBatchUpdateWithSplitting(docs, args.documentId, insertRequests, log);

        if (!args.rows || args.rows.length === 0) {
          return `Inserted ${rowCountToInsert} empty row(s) ${args.insertBelow ? 'below' : 'above'} row ${args.referenceRowIndex} in table ${args.tableId}.`;
        }

        const refreshed = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: true,
          fields: DOCUMENT_GET_FULL_WITH_TABS,
        });

        const updatedTable = getTableById(refreshed.data, args.tableId, args.tabId);
        if (!updatedTable) {
          throw new UserError(`Table "${args.tableId}" could not be found after inserting rows.`);
        }

        const firstInsertedRowIndex = args.insertBelow ? args.referenceRowIndex + 1 : args.referenceRowIndex;

        for (const [offset, rowValues] of args.rows.entries()) {
          const currentTable =
            offset === 0
              ? updatedTable
              : getTableById(
                  (
                    await docs.documents.get({
                      documentId: args.documentId,
                      includeTabsContent: true,
                      fields: DOCUMENT_GET_FULL_WITH_TABS,
                    })
                  ).data,
                  args.tableId,
                  args.tabId
                );
          if (!currentTable) {
            throw new UserError(
              `Table "${args.tableId}" could not be re-fetched while populating inserted rows.`
            );
          }
          await replaceTableRowDataInternal(
            docs,
            args.documentId,
            currentTable,
            firstInsertedRowIndex + offset,
            rowValues,
            args.tabId
          );
        }

        return `Inserted ${args.rows.length} row(s) with data ${args.insertBelow ? 'below' : 'above'} row ${args.referenceRowIndex} in table ${args.tableId}.`;
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
