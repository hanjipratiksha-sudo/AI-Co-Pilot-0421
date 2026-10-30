/**
 * Safety & Human-in-the-Loop Gate
 * Enforces risk policies and approval boundaries per PRD Section 18
 */

import { EventEmitter } from 'node:events';
import { RiskLevel, ApprovalRequest, ApprovalDecision, SafetyPolicy } from '../types/safety.js';

export class SafetyPolicyViolationError extends Error {
  constructor(public readonly toolName: string, public readonly riskLevel: RiskLevel, message: string) {
    super(`Safety policy violation for '${toolName}' (${riskLevel}): ${message}`);
    this.name = 'SafetyPolicyViolationError';
  }
}

export class SafetyGate extends EventEmitter {
  private policy: SafetyPolicy;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalHistory: Map<string, ApprovalDecision> = new Map();

  constructor(customPolicy?: Partial<SafetyPolicy>) {
    super();
    this.policy = {
      autoApproveLevelA: true,
      autoApproveLevelB: true,
      autoApproveLevelC: false,
      autoApproveLevelD: false, // Invariant: Level D can never be auto-approved
      ...customPolicy,
    };
    // Force safety invariant
    this.policy.autoApproveLevelD = false;
  }

  public getPolicy(): Readonly<SafetyPolicy> {
    return this.policy;
  }

  public updatePolicy(updates: Partial<SafetyPolicy>): void {
    this.policy = {
      ...this.policy,
      ...updates,
      autoApproveLevelD: false, // Invariant preserved
    };
  }

  /**
   * Determine whether an action requires human approval
   */
  public evaluate(
    workflowId: string,
    stepId: string,
    toolName: string,
    riskLevel: RiskLevel,
    parameters: Record<string, unknown>,
    description = ''
  ): { requiresApproval: boolean; approvalRequest?: ApprovalRequest } {
    // Check if tool is explicitly blocked
    if (this.policy.blockedToolNames?.includes(toolName)) {
      throw new SafetyPolicyViolationError(
        toolName,
        riskLevel,
        `Tool '${toolName}' is blocked by system policy`
      );
    }

    // Check if tool name is restricted to allowed list
    if (
      this.policy.allowedToolNames &&
      this.policy.allowedToolNames.length > 0 &&
      !this.policy.allowedToolNames.includes(toolName)
    ) {
      throw new SafetyPolicyViolationError(
        toolName,
        riskLevel,
        `Tool '${toolName}' is not in the permitted whitelist`
      );
    }

    // Category A: Informational -> no approval required
    if (riskLevel === RiskLevel.A_INFORMATIONAL && this.policy.autoApproveLevelA) {
      return { requiresApproval: false };
    }

    // Category B: Low-Risk -> policy checked
    if (riskLevel === RiskLevel.B_LOW_RISK && this.policy.autoApproveLevelB) {
      return { requiresApproval: false };
    }

    // Category C: Sensitive -> requires confirmation unless explicitly permitted in dev policy
    if (riskLevel === RiskLevel.C_SENSITIVE && this.policy.autoApproveLevelC) {
      return { requiresApproval: false };
    }

    // Category D: High Risk / Destructive -> ALWAYS requires explicit approval
    const approvalId = `appr_${workflowId}_${stepId}_${Date.now()}`;
    const consequencesSummary = this.generateConsequencesSummary(toolName, riskLevel, parameters);

    const approvalRequest: ApprovalRequest = {
      approvalId,
      workflowId,
      stepId,
      toolName,
      riskLevel,
      description: description || `Execution of tool '${toolName}' with parameters: ${JSON.stringify(parameters)}`,
      parameters,
      consequencesSummary,
      createdAt: Date.now(),
      requiresDoubleConfirmation: riskLevel === RiskLevel.D_HIGH_RISK_DESTRUCTIVE,
    };

    this.pendingApprovals.set(approvalId, approvalRequest);
    this.emit('approvalRequired', approvalRequest);

    return {
      requiresApproval: true,
      approvalRequest,
    };
  }

  /**
   * Submit user or system approval decision
   */
  public submitDecision(decision: ApprovalDecision): void {
    const request = this.pendingApprovals.get(decision.approvalId);
    if (!request) {
      throw new Error(`Approval request '${decision.approvalId}' not found or already resolved`);
    }

    this.pendingApprovals.delete(decision.approvalId);
    const key = this.getApprovalKey(decision.workflowId, request.stepId);
    this.approvalHistory.set(key, decision);

    this.emit('approvalResolved', { request, decision });
  }

  /**
   * Check if a specific step in a workflow has been approved
   */
  public isStepApproved(workflowId: string, stepId: string): boolean {
    const key = this.getApprovalKey(workflowId, stepId);
    const decision = this.approvalHistory.get(key);
    return decision ? decision.approved : false;
  }

  public getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  public clearHistory(): void {
    this.pendingApprovals.clear();
    this.approvalHistory.clear();
  }

  private getApprovalKey(workflowId: string, stepId: string): string {
    return `${workflowId}:${stepId}`;
  }

  private generateConsequencesSummary(toolName: string, riskLevel: RiskLevel, params: Record<string, unknown>): string {
    if (riskLevel === RiskLevel.D_HIGH_RISK_DESTRUCTIVE) {
      return `CRITICAL: Action '${toolName}' will permanently delete or modify persistent resources (Target: ${JSON.stringify(params)}). This operation cannot be easily undone.`;
    }
    if (riskLevel === RiskLevel.C_SENSITIVE) {
      return `WARNING: Action '${toolName}' alters system or user files/configuration. User confirmation is required before proceeding.`;
    }
    return `Notice: Action '${toolName}' requires authorization under current policy.`;
  }
}
