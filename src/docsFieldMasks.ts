/**
 * For documents.get with includeTabsContent: true, the API rejects field masks that
 * mix `tabs` with the legacy root `body` and text-level paths (paragraph, textRun, etc.)
 * in one request. Use a full projection for those reads (matches readDocument when tab
 * content is needed).
 */
export const DOCUMENT_GET_FULL_WITH_TABS = '*';
