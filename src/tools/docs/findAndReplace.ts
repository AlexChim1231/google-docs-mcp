import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';
import {
  looksLikeMarkdownStructuredContent,
  normalizeEscapedWhitespace,
  PLAIN_TEXT_TOOL_MARKDOWN_ERROR,
} from '../../textContentGuards.js';

const FindAndReplaceParameters = DocumentIdParameter.extend({
  findText: z.string().min(1).describe('The text to search for in the document.'),
  replaceText: z
    .string()
    .describe(
      'Plain text only. Do not use markdown syntax — use replaceRangeWithMarkdown for formatted content. Use an empty string to delete all occurrences.'
    ),
  matchCase: z
    .boolean()
    .optional()
    .describe('Whether the search should be case-sensitive. Defaults to false.'),
  tabId: z
    .string()
    .optional()
    .describe('Scope replacement to a specific tab. If omitted, replaces across all tabs.'),
});

export function register(server: FastMCP) {
  server.addTool({
    name: 'findAndReplace',
    description:
      'Replaces all occurrences of a text string throughout the document (or a specific tab). ' +
      'Returns the number of replacements made. Use an empty replaceText to delete all matches.',
    parameters: FindAndReplaceParameters,
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `findAndReplace in doc ${args.documentId}: "${args.findText}" → "${args.replaceText}"` +
          `${args.matchCase ? ' (case-sensitive)' : ''}` +
          `${args.tabId ? ` (tab: ${args.tabId})` : ''}`
      );

      try {
        if (args.replaceText && looksLikeMarkdownStructuredContent(args.replaceText)) {
          throw new UserError(PLAIN_TEXT_TOOL_MARKDOWN_ERROR);
        }

        const replaceText = args.replaceText
          ? normalizeEscapedWhitespace(args.replaceText)
          : args.replaceText;

        const request: docs_v1.Schema$Request = {
          replaceAllText: {
            containsText: {
              text: args.findText,
              matchCase: args.matchCase ?? false,
            },
            replaceText,
            ...(args.tabId && { tabsCriteria: { tabIds: [args.tabId] } }),
          },
        };

        const response = await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [request]);
        const changed = response.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;

        return `Replaced ${changed} occurrence(s) of "${args.findText}" with "${replaceText}".`;
      } catch (error: any) {
        log.error(`Error in findAndReplace for doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to find and replace: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
