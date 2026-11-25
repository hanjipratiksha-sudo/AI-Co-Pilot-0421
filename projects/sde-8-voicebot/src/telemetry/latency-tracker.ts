export interface LatencyBreakdown {
  captureStageMs: number;
  sanitizationStageMs: number;
  observationStoreStageMs: number;
  contextPackingStageMs: number;
  securityCheckStageMs: number;
  reasoningExecutionStageMs: number;
  groundingVerificationStageMs: number;
  totalLatencyMs: number;
}

export type LatencyStage = keyof Omit<LatencyBreakdown, 'totalLatencyMs'>;

export interface LatencyRecord {
  requestId: string;
  sessionId: string;
  timestamp: string;
  stages: LatencyBreakdown;
}

/**
 * LatencyTracker (Week 4 - Days 25–27)
 * 
 * Provides per-stage latency instrumentation across the entire reasoning pipeline:
 * - Capture acquisition & bounds checking
 * - Privacy sanitization & PII redaction
 * - Observation store (duplicate hash & stale TTL)
 * - Bounded context builder token packing
 * - Security & prompt-injection analysis
 * - LLM reasoning synthesis
 * - Grounding verification & citation matching
 */
export class LatencyTracker {
  private activeTimers: Map<string, number> = new Map();
  private records: LatencyRecord[] = [];

  /**
   * Starts a timer for a specific stage within a request.
   */
  public start(requestId: string, stage: LatencyStage): void {
    const key = `${requestId}::${stage}`;
    this.activeTimers.set(key, performance.now());
  }

  /**
   * Ends a timer and returns the elapsed duration in milliseconds (rounded to 2 decimal places).
   */
  public end(requestId: string, stage: LatencyStage): number {
    const key = `${requestId}::${stage}`;
    const startTime = this.activeTimers.get(key);
    if (startTime === undefined) return 0;
    
    const elapsed = Math.max(0.1, performance.now() - startTime);
    this.activeTimers.delete(key);
    return Math.round(elapsed * 100) / 100;
  }

  /**
   * Helper to measure an asynchronous stage block directly.
   */
  public async measure<T>(
    requestId: string,
    stage: LatencyStage,
    fn: () => Promise<T> | T
  ): Promise<{ result: T; durationMs: number }> {
    this.start(requestId, stage);
    try {
      const result = await fn();
      const durationMs = this.end(requestId, stage);
      return { result, durationMs };
    } catch (err) {
      this.end(requestId, stage);
      throw err;
    }
  }

  /**
   * Records a complete end-to-end breakdown for a request.
   */
  public record(requestId: string, sessionId: string, stages: Omit<LatencyBreakdown, 'totalLatencyMs'>): LatencyRecord {
    const totalLatencyMs = Math.round(
      (stages.captureStageMs +
      stages.sanitizationStageMs +
      stages.observationStoreStageMs +
      stages.contextPackingStageMs +
      stages.securityCheckStageMs +
      stages.reasoningExecutionStageMs +
      stages.groundingVerificationStageMs) * 100
    ) / 100;

    const record: LatencyRecord = {
      requestId,
      sessionId,
      timestamp: new Date().toISOString(),
      stages: {
        ...stages,
        totalLatencyMs
      }
    };

    this.records.push(record);
    return record;
  }

  /**
   * Returns formatted tabular latency report.
   */
  public formatReport(record: LatencyRecord): string {
    const s = record.stages;
    return [
      `--- LATENCY BREAKDOWN (Request: ${record.requestId}) ---`,
      `  1. Capture & Bounding Stage:       ${s.captureStageMs.toFixed(2)} ms`,
      `  2. Privacy & PII Redaction:        ${s.sanitizationStageMs.toFixed(2)} ms`,
      `  3. Observation Store (Hash/Stale): ${s.observationStoreStageMs.toFixed(2)} ms`,
      `  4. Context Packing & Token Budget: ${s.contextPackingStageMs.toFixed(2)} ms`,
      `  5. Security & Injection Defense:   ${s.securityCheckStageMs.toFixed(2)} ms`,
      `  6. Reasoning Execution (Mock LLM): ${s.reasoningExecutionStageMs.toFixed(2)} ms`,
      `  7. Grounding & Citations:          ${s.groundingVerificationStageMs.toFixed(2)} ms`,
      `  ----------------------------------------------------`,
      `  TOTAL END-TO-END LATENCY:          ${s.totalLatencyMs.toFixed(2)} ms`
    ].join('\n');
  }

  public getRecords(): LatencyRecord[] {
    return [...this.records];
  }

  public getAverageTotalLatencyMs(): number {
    if (this.records.length === 0) return 0;
    const sum = this.records.reduce((acc, r) => acc + r.stages.totalLatencyMs, 0);
    return Math.round((sum / this.records.length) * 100) / 100;
  }
}
