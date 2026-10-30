/**
 * Mock Tool Executor
 * Simulates tool invocations with configurable latency, failure modes, and parameter checking
 */

import {
  IToolExecutor,
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
  MockToolBehavior,
} from '../types/tool.js';
import { ToolRegistry } from './ToolRegistry.js';

export class MockToolExecutor implements IToolExecutor {
  private registry: ToolRegistry;
  private mockBehaviors: Map<string, MockToolBehavior> = new Map();
  private failureCounters: Map<string, number> = new Map();
  private executionHistory: ToolExecutionResult[] = [];

  constructor(registry?: ToolRegistry) {
    this.registry = registry ?? new ToolRegistry(true);
    this.setupDefaultMockHandlers();
  }

  public getRegistry(): ToolRegistry {
    return this.registry;
  }

  public registerTool(tool: ToolDefinition, mockConfig?: MockToolBehavior): void {
    this.registry.register(tool);
    if (mockConfig) {
      this.configureMock(tool.name, mockConfig);
    }
  }

  public getTool(toolName: string): ToolDefinition | undefined {
    return this.registry.get(toolName);
  }

  public listTools(): ToolDefinition[] {
    return this.registry.list();
  }

  public configureMock(toolName: string, behavior: MockToolBehavior): void {
    this.mockBehaviors.set(toolName, { ...behavior });
    // Reset failure counter if failNTimes is configured
    if (behavior.failNTimes !== undefined) {
      this.failureCounters.set(toolName, behavior.failNTimes);
    }
  }

  public resetMocks(): void {
    this.mockBehaviors.clear();
    this.failureCounters.clear();
    this.setupDefaultMockHandlers();
  }

  public clearHistory(): void {
    this.executionHistory = [];
  }

  public getExecutionHistory(): ToolExecutionResult[] {
    return [...this.executionHistory];
  }

  /**
   * Executes a tool request through the mock pipeline
   */
  public async execute<T = unknown>(request: ToolExecutionRequest): Promise<ToolExecutionResult<T>> {
    const startTime = Date.now();
    const tool = this.registry.require(request.toolName);

    // Validate parameters
    try {
      this.registry.validateParameters(request.toolName, request.parameters);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const res: ToolExecutionResult<T> = {
        requestId: request.requestId,
        toolName: request.toolName,
        success: false,
        durationMs,
        timestamp: Date.now(),
        error: {
          code: 'PARAM_VALIDATION_ERROR',
          message: err instanceof Error ? err.message : String(err),
          isRetryable: false,
        },
      };
      this.executionHistory.push(res);
      return res;
    }

    const mockConfig = this.mockBehaviors.get(request.toolName) ?? {};

    // 1. Simulate Latency
    if (mockConfig.simulatedLatencyMs) {
      let delay = 0;
      if (typeof mockConfig.simulatedLatencyMs === 'number') {
        delay = mockConfig.simulatedLatencyMs;
      } else {
        const { min, max } = mockConfig.simulatedLatencyMs;
        delay = Math.floor(Math.random() * (max - min + 1)) + min;
      }
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // 2. Simulate Timeout
    if (mockConfig.simulateTimeout) {
      const durationMs = Date.now() - startTime;
      const res: ToolExecutionResult<T> = {
        requestId: request.requestId,
        toolName: request.toolName,
        success: false,
        durationMs,
        timestamp: Date.now(),
        error: {
          code: 'TOOL_TIMEOUT',
          message: `Tool execution '${request.toolName}' exceeded timeout limit`,
          isRetryable: true,
        },
      };
      this.executionHistory.push(res);
      return res;
    }

    // 3. Check consecutive fail-N-times simulation
    const remainingFails = this.failureCounters.get(request.toolName);
    if (remainingFails !== undefined && remainingFails > 0) {
      this.failureCounters.set(request.toolName, remainingFails - 1);
      const durationMs = Date.now() - startTime;
      const res: ToolExecutionResult<T> = {
        requestId: request.requestId,
        toolName: request.toolName,
        success: false,
        durationMs,
        timestamp: Date.now(),
        error: {
          code: mockConfig.failureErrorCode ?? 'SIMULATED_TRANSIENT_ERROR',
          message:
            mockConfig.failureErrorMessage ??
            `Simulated transient failure for tool '${request.toolName}' (${remainingFails} remaining)`,
          isRetryable: true,
        },
      };
      this.executionHistory.push(res);
      return res;
    }

    // 4. Check probabilistic failure rate
    if (mockConfig.failureRate !== undefined && mockConfig.failureRate > 0) {
      if (Math.random() < mockConfig.failureRate) {
        const durationMs = Date.now() - startTime;
        const res: ToolExecutionResult<T> = {
          requestId: request.requestId,
          toolName: request.toolName,
          success: false,
          durationMs,
          timestamp: Date.now(),
          error: {
            code: mockConfig.failureErrorCode ?? 'SIMULATED_PROBABILISTIC_ERROR',
            message:
              mockConfig.failureErrorMessage ??
              `Simulated random failure for tool '${request.toolName}'`,
            isRetryable: true,
          },
        };
        this.executionHistory.push(res);
        return res;
      }
    }

    // 5. Execute mock handler or default behavior
    try {
      let data: unknown;
      if (mockConfig.mockHandler) {
        data = await Promise.resolve(mockConfig.mockHandler(request.parameters));
      } else {
        data = await this.executeDefaultHandler(request.toolName, request.parameters);
      }

      const durationMs = Date.now() - startTime;
      const res: ToolExecutionResult<T> = {
        requestId: request.requestId,
        toolName: request.toolName,
        success: true,
        data: data as T,
        durationMs,
        timestamp: Date.now(),
      };
      this.executionHistory.push(res);
      return res;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const res: ToolExecutionResult<T> = {
        requestId: request.requestId,
        toolName: request.toolName,
        success: false,
        durationMs,
        timestamp: Date.now(),
        error: {
          code: 'EXECUTION_EXCEPTION',
          message: err instanceof Error ? err.message : String(err),
          isRetryable: tool.failureBehavior === 'RETRY',
        },
      };
      this.executionHistory.push(res);
      return res;
    }
  }

  private setupDefaultMockHandlers(): void {
    this.configureMock('file_search', {
      mockHandler: (params) => {
        const pattern = String(params.pattern ?? '*');
        if (pattern.includes('.pdf') || pattern.includes('report')) {
          return {
            files: ['documents/quarterly_report.pdf', 'research/ai_copilot_specs.pdf'],
            matchCount: 2,
          };
        }
        return {
          files: ['src/index.ts', 'src/app.ts', 'tests/app.test.ts'],
          matchCount: 3,
        };
      },
    });

    this.configureMock('file_read', {
      mockHandler: (params) => {
        const filePath = String(params.filePath ?? 'unknown');
        if (filePath.endsWith('.pdf')) {
          return {
            content:
              '# Quarterly Research Report\nKey Findings: Multimodal voice interaction with screen context increases developer task completion speed by 42%. Safety gates prevent unintended destructive actions.',
            pages: 14,
            mimeType: 'application/pdf',
          };
        }
        return {
          content: 'export const status = "operational";\nconsole.log("System initialized");',
          lines: 2,
          mimeType: 'text/plain',
        };
      },
    });

    this.configureMock('summarize_text', {
      mockHandler: (params) => {
        const text = String(params.text ?? '');
        const maxPoints = Number(params.maxPoints ?? 3);
        return {
          summary: [
            'Context-aware AI voice co-pilot improves productivity without context switching.',
            'Safety gates classify actions from Level A (informational) to Level D (destructive).',
            'Robust agentic state machine orchestrates multi-step reasoning workflows.',
          ].slice(0, maxPoints),
          sourceLength: text.length,
          compressedRatio: 0.28,
        };
      },
    });

    this.configureMock('code_analyze', {
      mockHandler: (params) => {
        const error = String(params.errorMessage ?? '');
        return {
          diagnosis: `Identified issue: ${error.includes('import') ? 'Missing module import' : 'Syntax or type mismatch'}`,
          probableCause: 'Referenced identifier is not exported from the module',
          suggestedFix: 'Add the missing named export in the target source file',
          confidence: 0.94,
        };
      },
    });

    this.configureMock('browser_search', {
      mockHandler: (params) => {
        const query = String(params.query ?? '');
        return {
          query,
          results: [
            { title: 'TypeScript State Machine Patterns', url: 'https://docs.example.com/fsm' },
            { title: 'LangGraph and Agentic Workflows Guide', url: 'https://example.com/agents' },
          ],
        };
      },
    });

    this.configureMock('file_modify', {
      mockHandler: (params) => {
        return {
          modified: true,
          filePath: params.filePath,
          bytesWritten: String(params.content ?? '').length,
          timestamp: Date.now(),
        };
      },
    });

    this.configureMock('file_delete', {
      mockHandler: (params) => {
        return {
          deleted: true,
          filePath: params.filePath,
          timestamp: Date.now(),
        };
      },
    });

    this.configureMock('ocr_extract', {
      mockHandler: (params) => {
        return {
          region: params.region ?? 'active_window',
          extractedText: 'TypeError: Cannot read properties of undefined (reading "execute")',
          confidence: 0.98,
        };
      },
    });

    this.configureMock('calculator', {
      mockHandler: (params) => {
        const expr = String(params.expression ?? '0');
        // Simple safe numeric evaluation
        try {
          // eslint-disable-next-line no-eval
          const cleanExpr = expr.replace(/[^0-9+\-*/().]/g, '');
          const result = Function(`"use strict"; return (${cleanExpr})`)();
          return { expression: expr, result };
        } catch {
          return { expression: expr, result: 0 };
        }
      },
    });
  }

  private async executeDefaultHandler(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    return {
      message: `Tool '${toolName}' executed successfully with default mock`,
      params,
    };
  }
}
