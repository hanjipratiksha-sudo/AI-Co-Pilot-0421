/**
 * Predefined Workflows Aligned with Academia AI Voice Co-Pilot PRD Scenarios
 */

import { WorkflowDefinition } from '../types/workflow.js';
import { RiskLevel } from '../types/safety.js';
import { WorkflowBuilder } from './WorkflowBuilder.js';

/**
 * UC-07 Multi-Step Task:
 * "Find my project report, summarize it, and give me the key points."
 */
export function createPdfSummarizeWorkflow(): WorkflowDefinition {
  return new WorkflowBuilder('wf_pdf_summarize', 'PDF Search and Summarization Workflow', 'Locates report, extracts content, summarizes key takeaways')
    .addObservationStep('obs_1', 'Gather Voice & Screen Context')
    .addReasoningStep('rsn_1', 'Determine User Intent (PDF Report Analysis)')
    .addPlanningStep('pln_1', 'Decompose Search -> Read -> Summarize Sequence')
    .addToolStep('step_search', 'Find Project Report', 'file_search', {
      pattern: '*.pdf',
      directory: './documents',
    }, {
      riskLevel: RiskLevel.B_LOW_RISK,
      outputVariable: 'searchResult',
      retryPolicy: { maxAttempts: 3, backoffMs: 100, backoffMultiplier: 2 },
    })
    .addToolStep('step_read', 'Read PDF Contents', 'file_read', (ctx) => {
      const searchRes = ctx.variables.searchResult as { files?: string[] } | undefined;
      const fileToRead = searchRes?.files?.[0] ?? 'documents/quarterly_report.pdf';
      return { filePath: fileToRead };
    }, {
      riskLevel: RiskLevel.B_LOW_RISK,
      outputVariable: 'pdfDocument',
      retryPolicy: { maxAttempts: 2, backoffMs: 150, backoffMultiplier: 1.5 },
    })
    .addToolStep('step_summarize', 'Synthesize Executive Summary', 'summarize_text', (ctx) => {
      const doc = ctx.variables.pdfDocument as { content?: string } | undefined;
      return {
        text: doc?.content ?? 'Academic report default content',
        maxPoints: 3,
        focus: 'Key outcomes and recommendations',
      };
    }, {
      riskLevel: RiskLevel.A_INFORMATIONAL,
      outputVariable: 'summaryReport',
    })
    .addVerificationStep('ver_1', 'Verify Summary Quality and Completeness')
    .addResponseStep('resp_1', 'Deliver Voice & UI Summary to User')
    .addSequentialTransitions()
    .build();
}

/**
 * UC-08 Controlled Computer Action:
 * "Delete obsolete files in temporary project directory."
 * Demonstrates Category D: High-Risk / Destructive safety gate with human confirmation.
 */
export function createControlledFileCleanupWorkflow(): WorkflowDefinition {
  return new WorkflowBuilder('wf_file_cleanup', 'Controlled File Cleanup Workflow', 'Locates obsolete files and executes deletion after explicit human authorization')
    .addObservationStep('obs_1', 'Observe Directory Context')
    .addReasoningStep('rsn_1', 'Identify Obsolete Artifacts')
    .addToolStep('step_find_obsolete', 'Find Temporary Cache Files', 'file_search', {
      pattern: 'cache_*.tmp',
      directory: './temp',
    }, {
      riskLevel: RiskLevel.B_LOW_RISK,
      outputVariable: 'obsoleteFiles',
    })
    .addToolStep('step_delete_file', 'Delete Obsolete Cache File', 'file_delete', {
      filePath: './temp/cache_session.tmp',
      recursive: false,
    }, {
      riskLevel: RiskLevel.D_HIGH_RISK_DESTRUCTIVE, // Requires explicit user approval
      outputVariable: 'deletionResult',
      fallbackAction: {
        type: 'DEFAULT_OUTPUT',
        defaultOutput: { deleted: false, reason: 'User denied deletion confirmation' },
      },
    })
    .addResponseStep('resp_1', 'Notify User of Cleanup Outcome')
    .addSequentialTransitions()
    .build();
}

/**
 * UC-02 Explain Technical Error:
 * "Why is this failing?"
 * Captures screen/terminal error, analyzes root cause, and formulates explanation.
 */
export function createCodeErrorDiagnosisWorkflow(): WorkflowDefinition {
  return new WorkflowBuilder('wf_code_error_diag', 'Code Error Diagnosis Workflow', 'Extracts visible error via OCR, performs root cause analysis, recommends fix')
    .addObservationStep('obs_screen', 'Extract Error from Active Window', 'ocr_extract', {
      region: 'active_window',
      filter: 'error',
    })
    .addReasoningStep('rsn_analyze', 'Analyze Error Pattern')
    .addToolStep('step_analyze_code', 'Perform Code Diagnostics', 'code_analyze', (ctx) => {
      const ocr = ctx.stepResults.obs_screen as { extractedText?: string } | undefined;
      return {
        errorMessage: ocr?.extractedText ?? 'TypeError: undefined is not a function',
        language: 'typescript',
      };
    }, {
      riskLevel: RiskLevel.A_INFORMATIONAL,
      outputVariable: 'diagnosticReport',
    })
    .addResponseStep('resp_explanation', 'Deliver Spoken and Visual Explanation')
    .addSequentialTransitions()
    .build();
}
