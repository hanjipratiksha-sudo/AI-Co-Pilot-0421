/**
 * Mock Tool Executor
 * Simulates tool invocations with configurable latency, failure modes, and parameter checking
 */

import {
  IToolExecutor,
  ToolSpec,
  ToolExecutionRequest,
  ToolExecutionResult,
  MockToolBehavior,
} from '../types/tool.js';
import { RiskLevel } from '../types/safety.js';
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

  public registerTool(tool: ToolSpec, mockConfig?: MockToolBehavior): void {
    this.registry.register(tool);
    if (mockConfig) {
      this.configureMock(tool.name, mockConfig);
    }
  }

  public getTool(toolName: string): ToolSpec | undefined {
    return this.registry.get(toolName);
  }

  public listTools(): ToolSpec[] {
    return this.registry.list();
  }

  public configureMock(toolName: string, behavior: MockToolBehavior): void {
    this.mockBehaviors.set(toolName, { ...behavior });
    if (!this.registry.has(toolName)) {
      this.registry.register({
        name: toolName,
        description: `Mock simulated tool for ${toolName}`,
        purpose: 'Simulation and testing',
        riskLevel: RiskLevel.A_INFORMATIONAL,
        parameters: { type: 'object', properties: {} },
        failureBehavior: 'RETRY',
      });
    }
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
    this.configureMock('calculator', {
      mockHandler: (params) => {
        const expr = String(params.expression ?? '0');
        try {
          const cleanExpr = expr.replace(/[^0-9+\-*/().]/g, '');
          const result = Function(`"use strict"; return (${cleanExpr})`)();
          return { expression: expr, result };
        } catch {
          return { expression: expr, result: 0 };
        }
      },
    });

    this.configureMock('summarize_text', {
      mockHandler: (params) => {
        const text = String(params.text ?? '');
        const maxPoints = Number(params.maxPoints ?? 3);
        return {
          summary: [
            'Context-aware AI voice co-pilot improves productivity without context switching.',
            'Safety gates classify actions and enforce human-in-the-loop authorization.',
            'Deterministic state machine orchestrates multi-step agentic workflows.',
          ].slice(0, maxPoints),
          sourceLength: text.length,
          compressedRatio: 0.28,
        };
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
