import type { FastMCP } from 'fastmcp';
import { describe, expect, it } from 'vitest';
import { parseEnabledToolGroups, registerAllTools, TOOL_GROUPS } from './index.js';

type ToolConfig = Parameters<FastMCP['addTool']>[0];

function captureTools(groups: Parameters<typeof registerAllTools>[1]) {
  const tools: ToolConfig[] = [];
  const server = {
    addTool: (tool: ToolConfig) => {
      tools.push(tool);
    },
  };

  registerAllTools(server as FastMCP, groups);
  return tools.map((tool) => tool.name);
}

describe('parseEnabledToolGroups', () => {
  it('defaults to every tool group', () => {
    expect(parseEnabledToolGroups(undefined)).toEqual([...TOOL_GROUPS]);
    expect(parseEnabledToolGroups('  ')).toEqual([...TOOL_GROUPS]);
  });

  it('normalizes comma-separated tool group names in default order', () => {
    expect(parseEnabledToolGroups('sheets, docs, sheets')).toEqual(['docs', 'sheets']);
  });

  it('treats all as the default full registration', () => {
    expect(parseEnabledToolGroups('all')).toEqual([...TOOL_GROUPS]);
  });

  it('rejects unknown tool groups', () => {
    expect(() => parseEnabledToolGroups('docs,unknown')).toThrow('Unknown MCP_TOOL_GROUPS');
  });
});

describe('registerAllTools', () => {
  it('registers only the selected groups', () => {
    const toolNames = captureTools(['docs']);

    expect(toolNames).toContain('readDocument');
    expect(toolNames).toContain('appendText');
    expect(toolNames).not.toContain('listSpreadsheets');
    expect(toolNames).not.toContain('sendEmail');
  });

  it('can combine multiple selected groups', () => {
    const toolNames = captureTools(['docs', 'sheets']);

    expect(toolNames).toContain('readDocument');
    expect(toolNames).toContain('listSpreadsheets');
    expect(toolNames).not.toContain('sendEmail');
  });
});
