import type { FastMCP } from 'fastmcp';
import { describe, expect, it } from 'vitest';
import { toJsonSchema } from 'xsschema';
import { register as registerAppendRows } from './appendSpreadsheetRows.js';
import { register as registerAppendTableRows } from './appendTableRows.js';
import { register as registerBatchWrite } from './batchWrite.js';
import { register as registerCreateSpreadsheet } from './createSpreadsheet.js';
import { register as registerWriteSpreadsheet } from './writeSpreadsheet.js';

type ToolConfig = Parameters<FastMCP['addTool']>[0];

function captureTool(register: (server: FastMCP) => void): ToolConfig {
  let captured: ToolConfig | undefined;
  const server = {
    addTool: (tool: ToolConfig) => {
      captured = tool;
    },
  };

  register(server as FastMCP);

  if (!captured) throw new Error('Tool registration did not call addTool.');
  return captured;
}

async function buildInputSchema(tool: ToolConfig) {
  if (!tool.parameters) throw new Error(`${tool.name} has no parameter schema.`);
  return toJsonSchema(tool.parameters) as Promise<any>;
}

function expectNestedArrayItems(schema: any, propertyPath: string[]) {
  const schemaProperty = propertyPath.reduce((current, key) => current?.properties?.[key], schema);

  expect(schemaProperty?.items).toBeDefined();
  expect(schemaProperty.items?.items).toBeDefined();
}

describe('spreadsheet value tool schemas', () => {
  it.each([
    [registerWriteSpreadsheet, ['values']],
    [registerAppendRows, ['values']],
    [registerAppendTableRows, ['values']],
    [registerCreateSpreadsheet, ['initialData']],
    [registerBatchWrite, ['data', 'items', 'values']],
  ] as const)(
    'defines JSON Schema items for nested cell arrays',
    async (register, propertyPath) => {
      const tool = captureTool(register);
      const schema = await buildInputSchema(tool);

      if (propertyPath[1] === 'items') {
        const dataItems = schema.properties?.data?.items;
        expect(dataItems).toBeDefined();
        expectNestedArrayItems(dataItems, ['values']);
        return;
      }

      expectNestedArrayItems(schema, [...propertyPath]);
    }
  );
});
