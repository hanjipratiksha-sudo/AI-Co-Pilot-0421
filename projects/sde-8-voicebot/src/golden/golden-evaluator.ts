import { GOLDEN_TEST_SET, GoldenTestCase } from './golden-test-set';
import { GroundedReasoningService } from '../grounding/grounded-reasoning.service';
import { PromptInjectionGuard } from '../security/prompt-injection-guard';
import { ObservationStore } from '../observations/observation-store';
import { getSyntheticFrameByKey } from '../core/synthetic-frames';
import { LatencyTracker } from '../telemetry/latency-tracker';

export interface GoldenTestResult {
  testId: string;
  name: string;
  category: string;
  passed: boolean;
  errors: string[];
  durationMs: number;
}

export interface GoldenEvaluationSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  results: GoldenTestResult[];
  averageDurationMs: number;
}

/**
 * GoldenEvaluator (Week 4 - Days 22–24)
 * 
 * Executes the golden benchmark suite in mock mode, validating that the reasoning
 * module satisfies all grounding, citation, anti-hallucination, and security invariants.
 */
export class GoldenEvaluator {
  private grounder: GroundedReasoningService;
  private guard: PromptInjectionGuard;
  private latencyTracker: LatencyTracker;

  constructor() {
    this.grounder = new GroundedReasoningService();
    this.guard = new PromptInjectionGuard();
    this.latencyTracker = new LatencyTracker();
  }

  public async evaluateAll(): Promise<GoldenEvaluationSummary> {
    const results: GoldenTestResult[] = [];
    let totalDurationMs = 0;

    for (const testCase of GOLDEN_TEST_SET) {
      const start = performance.now();
      const testResult = await this.evaluateSingle(testCase);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      totalDurationMs += durationMs;

      results.push({
        ...testResult,
        durationMs
      });
    }

    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;
    const passRate = Math.round((passedTests / results.length) * 100);

    return {
      totalTests: results.length,
      passedTests,
      failedTests,
      passRate,
      results,
      averageDurationMs: Math.round((totalDurationMs / results.length) * 100) / 100
    };
  }

  public async evaluateSingle(tc: GoldenTestCase): Promise<Omit<GoldenTestResult, 'durationMs'>> {
    const errors: string[] = [];
    const store = new ObservationStore({ initialConsent: true });

    // 1. Ingest Synthetic Frame
    const frame = getSyntheticFrameByKey(tc.syntheticFrameKey);
    if (!frame) {
      return {
        testId: tc.id,
        name: tc.name,
        category: tc.category,
        passed: false,
        errors: [`Synthetic frame definition '${tc.syntheticFrameKey}' not found.`]
      };
    }

    let ocrContent = frame.ocrContent;
    if (tc.adversarialScreenOcr) {
      ocrContent += `\n${tc.adversarialScreenOcr}`;
    }

    // Security check on screen content
    const sanitizedOcr = this.guard.sanitizeScreenContent(ocrContent);
    if (tc.expected.commandDisarmed && !sanitizedOcr.includes('[DISARMED_DANGEROUS_COMMAND]')) {
      errors.push('Expected adversarial screen command to be disarmed with [DISARMED_DANGEROUS_COMMAND].');
    }

    store.ingestRaw(
      sanitizedOcr,
      {
        application: frame.application,
        windowTitle: frame.windowTitle,
        capturedAt: new Date().toISOString(),
        isSynthetic: true
      },
      'screen_ocr'
    );

    // 2. Query Analysis & Prompt Injection Check
    const injectionAnalysis = this.guard.analyzeAndSanitize(tc.userQuery);
    if (tc.expected.injectionDetected && !injectionAnalysis.hasInjection) {
      errors.push('Expected prompt injection signatures to be detected in user query.');
    }

    const safeQuery = injectionAnalysis.sanitizedText || tc.userQuery;

    // 3. Grounded Answer Synthesis
    const answer = this.grounder.generateGroundedAnswer(safeQuery, store.getObservations());

    // 4. Invariant Assertions
    if (answer.status !== tc.expected.status) {
      errors.push(`Status mismatch: expected '${tc.expected.status}', got '${answer.status}'.`);
    }

    if (answer.evidenceFound !== tc.expected.evidenceFound) {
      errors.push(`Evidence found mismatch: expected ${tc.expected.evidenceFound}, got ${answer.evidenceFound}.`);
    }

    if (answer.riskLevel !== tc.expected.riskLevel) {
      errors.push(`Risk level mismatch: expected '${tc.expected.riskLevel}', got '${answer.riskLevel}'.`);
    }

    if (answer.requiresApproval !== tc.expected.requiresApproval) {
      errors.push(`Approval mismatch: expected ${tc.expected.requiresApproval}, got ${answer.requiresApproval}.`);
    }

    if (tc.expected.expectedSourceApp && (!answer.citations[0] || answer.citations[0].application !== tc.expected.expectedSourceApp)) {
      errors.push(`Source app mismatch: expected '${tc.expected.expectedSourceApp}', got '${answer.citations[0]?.application}'.`);
    }

    if (tc.expected.expectedQuoteSubstring && (!answer.citations[0] || !answer.citations[0].quote.includes(tc.expected.expectedQuoteSubstring))) {
      errors.push(`Quote missing expected substring '${tc.expected.expectedQuoteSubstring}'.`);
    }

    if (tc.expected.expectedAnswerSubstring && !answer.answerText.includes(tc.expected.expectedAnswerSubstring)) {
      errors.push(`Answer text missing expected substring '${tc.expected.expectedAnswerSubstring}'.`);
    }

    return {
      testId: tc.id,
      name: tc.name,
      category: tc.category,
      passed: errors.length === 0,
      errors
    };
  }
}
