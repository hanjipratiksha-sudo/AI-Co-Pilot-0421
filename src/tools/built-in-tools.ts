/**
 * Built-in Standard Tool Definitions
 * Aligned with Academia AI Voice Co-Pilot PRD (UC-01 to UC-08) & SDD Section 17
 */

import { ToolDefinition } from '../types/tool.js';
import { RiskLevel } from '../types/safety.js';

export const BUILT_IN_TOOLS: Record<string, ToolDefinition> = {
  ocr_extract: {
    name: 'ocr_extract',
    description: 'Extracts visible text and UI elements from screen capture or image region',
    purpose: 'Screen understanding and visual context processing (UC-01, UC-03)',
    riskLevel: RiskLevel.A_INFORMATIONAL,
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', description: 'Screen region to analyze (e.g., active_window, full_screen)' },
        filter: { type: 'string', description: 'Optional keyword or pattern to focus extraction on' },
      },
    },
    failureBehavior: 'RETRY',
  },

  summarize_text: {
    name: 'summarize_text',
    description: 'Generates concise, bulleted, or structured summary of given text or document content',
    purpose: 'Document and conversation summarization (UC-03, UC-07)',
    riskLevel: RiskLevel.A_INFORMATIONAL,
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Content text to summarize', required: true },
        maxPoints: { type: 'number', description: 'Maximum number of bullet points' },
        focus: { type: 'string', description: 'Specific focus area for summary' },
      },
      required: ['text'],
    },
    failureBehavior: 'RETRY',
  },

  code_analyze: {
    name: 'code_analyze',
    description: 'Analyzes code snippets, stack traces, and compiler errors to find root cause',
    purpose: 'Developer workflow error diagnosis (UC-02)',
    riskLevel: RiskLevel.A_INFORMATIONAL,
    parameters: {
      type: 'object',
      properties: {
        codeSnippet: { type: 'string', description: 'Source code content' },
        errorMessage: { type: 'string', description: 'Compiler or runtime error message', required: true },
        language: { type: 'string', description: 'Programming language (e.g. typescript, python)' },
      },
      required: ['errorMessage'],
    },
    failureBehavior: 'RETRY',
  },

  browser_search: {
    name: 'browser_search',
    description: 'Searches documentation, web resources, or knowledge bases for technical info',
    purpose: 'Online research and technical query resolution (UC-05)',
    riskLevel: RiskLevel.B_LOW_RISK,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or query string', required: true },
        limit: { type: 'number', description: 'Maximum number of results to return' },
      },
      required: ['query'],
    },
    failureBehavior: 'RETRY',
  },

  file_search: {
    name: 'file_search',
    description: 'Searches permitted local project directories for files matching name or extension',
    purpose: 'Locate project reports, documents, and code files (UC-06, UC-07)',
    riskLevel: RiskLevel.B_LOW_RISK,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'File pattern or regex (e.g. *.pdf, *report*)', required: true },
        directory: { type: 'string', description: 'Search root directory path' },
      },
      required: ['pattern'],
    },
    failureBehavior: 'RETRY',
  },

  file_read: {
    name: 'file_read',
    description: 'Reads contents of a permitted file from disk',
    purpose: 'Ingest document, code, or spreadsheet data (UC-03, UC-04, UC-07)',
    riskLevel: RiskLevel.B_LOW_RISK,
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or relative file path to read', required: true },
        maxBytes: { type: 'number', description: 'Maximum bytes to read' },
      },
      required: ['filePath'],
    },
    failureBehavior: 'RETRY',
  },

  file_modify: {
    name: 'file_modify',
    description: 'Modifies existing file or appends content to a specified path',
    purpose: 'Controlled file updates and edits (UC-08)',
    riskLevel: RiskLevel.C_SENSITIVE,
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Target file path to modify', required: true },
        content: { type: 'string', description: 'New content to write', required: true },
        mode: { type: 'string', description: 'Write mode (append | overwrite)' },
      },
      required: ['filePath', 'content'],
    },
    failureBehavior: 'FALLBACK',
  },

  file_delete: {
    name: 'file_delete',
    description: 'Permanently deletes a file or directory from the workspace',
    purpose: 'Controlled file cleanup operations (UC-08)',
    riskLevel: RiskLevel.D_HIGH_RISK_DESTRUCTIVE,
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'File or directory path to delete', required: true },
        recursive: { type: 'boolean', description: 'Whether to delete recursively if directory' },
      },
      required: ['filePath'],
    },
    failureBehavior: 'ABORT',
  },

  calculator: {
    name: 'calculator',
    description: 'Evaluates basic mathematical expressions',
    purpose: 'Spreadsheet and numeric data analysis (UC-04)',
    riskLevel: RiskLevel.A_INFORMATIONAL,
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Arithmetic expression to compute', required: true },
      },
      required: ['expression'],
    },
    failureBehavior: 'RETRY',
  },
};
