import { OptInCaptureAdapter, FramePayload } from '../capture/capture.adapter';
import { ObservationStore } from '../observations/observation-store';
import { BoundedContextBuilder } from '../builder/bounded-context-builder';
import { PromptInjectionGuard } from '../security/prompt-injection-guard';
import { GroundedReasoningService } from '../grounding/grounded-reasoning.service';
import { GroundedAnswer } from '../grounding/grounding.types';
import { LatencyTracker, LatencyRecord } from '../telemetry/latency-tracker';
import { MockWorkflowHandoffAdapter, WorkflowHandoffResult } from '../workflow-handoff/workflow-handoff.adapter';
import { ContextManager } from './context-manager';

export interface PipelineExecutionResult {
  answer: GroundedAnswer;
  latency: LatencyRecord;
  latencyReport: string;
  workflowResult?: WorkflowHandoffResult;
}

/**
 * ReasoningPipeline (Week 4 - Days 25–27, D30)
 * 
 * Integrated end-to-end pipeline uniting:
 * 1. Opt-In Capture & Bounding
 * 2. Privacy & PII Redaction
 * 3. Observation Store with Stale/Duplicate Filtering
 * 4. Bounded Context Builder with Token Packing
 * 5. Prompt-Injection Security Checks
 * 6. Grounded Reasoning with Source Citations & No-Evidence Handling
 * 7. Per-Stage Latency Instrumentation
 */
export class ReasoningPipeline {
  private captureAdapter: OptInCaptureAdapter;
  private observationStore: ObservationStore;
  private contextBuilder: BoundedContextBuilder;
  private guard: PromptInjectionGuard;
  private grounder: GroundedReasoningService;
  private handoffAdapter: MockWorkflowHandoffAdapter;
  private contextManager: ContextManager;
  private latencyTracker: LatencyTracker;

  constructor() {
    this.captureAdapter = new OptInCaptureAdapter({ minSamplingIntervalMs: 500 });
    this.observationStore = new ObservationStore({ initialConsent: false, staleTtlMs: 300_000 });
    this.contextBuilder = new BoundedContextBuilder({ maxTokenBudget: 1024, ttlMs: 300_000 });
    this.guard = new PromptInjectionGuard();
    this.grounder = new GroundedReasoningService();
    this.handoffAdapter = new MockWorkflowHandoffAdapter();
    this.contextManager = new ContextManager();
    this.latencyTracker = new LatencyTracker();
  }

  public getCaptureAdapter(): OptInCaptureAdapter {
    return this.captureAdapter;
  }

  public getObservationStore(): ObservationStore {
    return this.observationStore;
  }

  public getLatencyTracker(): LatencyTracker {
    return this.latencyTracker;
  }

  /**
   * Executes the complete reasoning pipeline with per-stage latency tracking.
   */
  public async processRequest(
    userQuery: string,
    frameCandidate?: FramePayload,
    options?: { sessionId?: string; autoApproveHandoff?: boolean }
  ): Promise<PipelineExecutionResult> {
    const sessionId = options?.sessionId || `sess-${Date.now()}`;
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    // Stage 1: Capture & Bounding
    this.latencyTracker.start(requestId, 'captureStageMs');
    let capturedFrame: FramePayload | undefined;
    if (frameCandidate) {
      if (frameCandidate.isSynthetic) {
        capturedFrame = frameCandidate;
      } else {
        capturedFrame = this.captureAdapter.capture(frameCandidate);
      }
    }
    const captureStageMs = this.latencyTracker.end(requestId, 'captureStageMs');

    // Stage 2: Privacy Sanitization & PII Redaction
    this.latencyTracker.start(requestId, 'sanitizationStageMs');
    const sanitizedQuery = this.contextManager.sanitize(userQuery);
    if (capturedFrame) {
      capturedFrame.ocrContent = this.contextManager.sanitize(capturedFrame.ocrContent);
    }
    const sanitizationStageMs = this.latencyTracker.end(requestId, 'sanitizationStageMs');

    // Stage 3: Observation Store (Duplicate Hash & Stale TTL Check)
    this.latencyTracker.start(requestId, 'observationStoreStageMs');
    if (capturedFrame) {
      this.observationStore.ingestFrame(capturedFrame);
    }
    const observationStoreStageMs = this.latencyTracker.end(requestId, 'observationStoreStageMs');

    // Stage 4: Context Packing & Token Budget Allocation
    this.latencyTracker.start(requestId, 'contextPackingStageMs');
    const rawObservations = this.observationStore.getObservations();
    const contextItems = rawObservations.map(obs => ({
      id: obs.id,
      source: obs.source,
      type: obs.type,
      content: obs.content,
      confidence: obs.confidence,
      isSynthetic: obs.isSynthetic,
      metadata: obs.metadata || {}
    }));
    const packedContext = this.contextBuilder.buildBoundedContext(contextItems, { query: sanitizedQuery });
    const contextPackingStageMs = this.latencyTracker.end(requestId, 'contextPackingStageMs');

    // Stage 5: Security & Prompt Injection Analysis
    this.latencyTracker.start(requestId, 'securityCheckStageMs');
    const injectionAnalysis = this.guard.analyzeAndSanitize(sanitizedQuery);
    const safeQuery = injectionAnalysis.sanitizedText || sanitizedQuery;
    const securityCheckStageMs = this.latencyTracker.end(requestId, 'securityCheckStageMs');

    // Stage 6: Reasoning Execution (Mock LLM Synthesis)
    this.latencyTracker.start(requestId, 'reasoningExecutionStageMs');
    // Simulated deterministic inference time
    await new Promise(r => setTimeout(r, 12));
    const reasoningExecutionStageMs = this.latencyTracker.end(requestId, 'reasoningExecutionStageMs');

    // Stage 7: Grounding Verification & Citation Extraction
    this.latencyTracker.start(requestId, 'groundingVerificationStageMs');
    const answer = this.grounder.generateGroundedAnswer(safeQuery, rawObservations, { sessionId });
    const groundingVerificationStageMs = this.latencyTracker.end(requestId, 'groundingVerificationStageMs');

    // Record complete telemetry
    const latencyRecord = this.latencyTracker.record(requestId, sessionId, {
      captureStageMs,
      sanitizationStageMs,
      observationStoreStageMs,
      contextPackingStageMs,
      securityCheckStageMs,
      reasoningExecutionStageMs,
      groundingVerificationStageMs
    });

    const latencyReport = this.latencyTracker.formatReport(latencyRecord);

    // Optional Workflow Handoff
    let workflowResult: WorkflowHandoffResult | undefined;
    if (answer.intent === 'EXPLAIN_ERROR') {
      const proposal = this.handoffAdapter.createStandardDiagnosticProposal(sessionId, answer.answerText);
      workflowResult = await this.handoffAdapter.handoff(proposal, {
        approveLevelC: options?.autoApproveHandoff ?? true
      });
    }

    return {
      answer,
      latency: latencyRecord,
      latencyReport,
      workflowResult
    };
  }
}
