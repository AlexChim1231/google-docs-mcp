import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient, getDriveClient } from '../../clients.js';
import { DocumentIdParameter, NotImplementedError } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import { docsJsonToMarkdown } from '../../markdown-transformer/index.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'readDocument',
    description:
      "Reads the content of a Google Document. Returns plain text by default. Use format='markdown' to get formatted content suitable for editing and re-uploading with replaceDocumentWithMarkdown, or format='json' for the raw document structure.",
    parameters: DocumentIdParameter.extend({
      format: z
        .enum(['text', 'json', 'markdown'])
        .optional()
        .default('text')
        .describe(
          "Output format: 'text' (plain text, from Drive api export, include all tabs), 'json' (raw API structure, complex), 'markdown' (from Drive api export, include all tabs)."
        ),
      maxLength: z
        .number()
        .optional()
        .describe(
          'Maximum character limit for text output. If not specified, returns full document content. Use this to limit very large documents.'
        ),
      tabId: z
        .string()
        .optional()
        .describe(
          'The ID of the specific tab to read. If not specified, reads the first tab (or legacy document.body for documents without tabs). This is only applicable if the format is `json`'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Reading Google Doc: ${args.documentId}, Format: ${args.format}${args.tabId ? `, Tab: ${args.tabId}` : ''}`
      );

      try {
        // Determine if we need tabs content
        const needsTabsContent = !!args.tabId;

        const fields =
          args.format === 'json' || args.format === 'markdown'
            ? '*' // Get everything for structure analysis
            : 'body(content(paragraph(elements(textRun(content)))))'; // Just text content

        const res = await docs.documents.get({
          documentId: args.documentId,
          includeTabsContent: needsTabsContent,
          fields: needsTabsContent ? '*' : fields, // Get full document if using tabs
        });
        log.info(`Fetched doc: ${args.documentId}${args.tabId ? ` (tab: ${args.tabId})` : ''}`);

        // If tabId is specified, find the specific tab
        let contentSource: any;
        if (args.tabId) {
          const targetTab = GDocsHelpers.findTabById(res.data, args.tabId);
          if (!targetTab) {
            throw new UserError(`Tab with ID "${args.tabId}" not found in document.`);
          }
          if (!targetTab.documentTab) {
            throw new UserError(
              `Tab "${args.tabId}" does not have content (may not be a document tab).`
            );
          }
          contentSource = { body: targetTab.documentTab.body };
          log.info(`Using content from tab: ${targetTab.tabProperties?.title || 'Untitled'}`);
        } else {
          // Use the document body (backward compatible)
          contentSource = res.data;
        }

        if (args.format === 'json') {
          const jsonContent = JSON.stringify(contentSource, null, 2);
          // Apply length limit to JSON if specified
          if (args.maxLength && jsonContent.length > args.maxLength) {
            return (
              jsonContent.substring(0, args.maxLength) +
              `\n... [JSON truncated: ${jsonContent.length} total chars]`
            );
          }
          return jsonContent;
        }

        const text = args.format === 'markdown'
          ? await readDocumentAsMarkdown(args)
          : await readDocumentAsText(args);

        if (!args.maxLength) {
          return text;
        }

        return truncateText(text, args.maxLength);
      } catch (error: any) {
        log.error(
          `Error reading doc ${args.documentId}: ${error.message || 'Unknown error'} (code: ${error.code || 'N/A'})`
        );
        // Handle errors thrown by helpers or API directly
        if (error instanceof UserError) throw error;
        if (error instanceof NotImplementedError) throw error;
        // Generic fallback for API errors not caught by helpers
        if (error.code === 404) throw new UserError(`Doc not found (ID: ${args.documentId}).`);
        if (error.code === 403) {
          // The Docs API may be blocked by Workspace admin policy even when the Drive API is
          // accessible. Fall back to drive.files.export() for plain-text format, which uses
          // the Drive API and respects supportsAllDrives for Shared Drive documents.
          if (!args.format || args.format === 'text') {
            try {
              log.info(
                `Docs API returned 403, falling back to Drive export for ${args.documentId}`
              );
              const drive = await getDriveClient();
              const exportRes = await drive.files.export(
                { fileId: args.documentId, mimeType: 'text/plain' },
                { responseType: 'text' }
              );
              const textContent = (exportRes as any).data as string;
              if (!textContent?.trim()) return 'Document found, but appears empty.';
              if (args.maxLength && textContent.length > args.maxLength) {
                return `Content (truncated to ${args.maxLength} chars of ${textContent.length} total):\n---\n${textContent.substring(0, args.maxLength)}\n\n... [Document continues. Use maxLength parameter to adjust limit or remove it to get full content.]`;
              }
              return `Content (${textContent.length} characters):\n---\n${textContent}`;
            } catch (exportError: any) {
              log.error(`Drive export fallback also failed: ${exportError.message}`);
            }
          }
          throw new UserError(
            `Permission denied for doc (ID: ${args.documentId}). The Google Docs API may be restricted by your Workspace admin.`
          );
        }
        // Extract detailed error information from Google API response
        const errorDetails =
          error.response?.data?.error?.message || error.message || 'Unknown error';
        const errorCode = error.response?.data?.error?.code || error.code;
        throw new UserError(
          `Failed to read doc: ${errorDetails}${errorCode ? ` (Code: ${errorCode})` : ''}`
        );
      }
    },
  });
}

function maskBase64Content(markdown: string): string {
  return markdown.replace(
    /(data:[a-zA-Z0-9.+/-]+\/[a-zA-Z0-9.+-]+;base64,)[A-Za-z0-9+/=_-]+/g,
    '$1[MASKED_BASE64]'
  );
}

async function readDocumentAsMarkdown(args: any): Promise<string> {
  const drive = await getDriveClient();
  const exportRes = await drive.files.export(
    { fileId: args.documentId, mimeType: 'text/markdown' },
    { responseType: 'text' }
  );
  const textContent = (exportRes as any).data as string;
  return maskBase64Content(textContent);
}

async function readDocumentAsText(args: any): Promise<string> {
  const drive = await getDriveClient();
  const exportRes = await drive.files.export(
    { fileId: args.documentId, mimeType: 'text/plain' },
    { responseType: 'text' }
  );
  const textContent = (exportRes as any).data as string;
  return textContent;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncatedText = text.substring(0, maxLength);

  return `
  ${truncatedText}
  
  ... [Document continues for ${text.length - maxLength} more characters. Use maxLength parameter to adjust limit or remove it to get full content.]
  `;
}