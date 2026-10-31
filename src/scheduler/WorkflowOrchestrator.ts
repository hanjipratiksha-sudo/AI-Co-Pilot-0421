/**
 * Workflow Orchestrator
 * Coordinates multi-step reasoning workflows across StateMachine, SafetyGate, and ToolExecutor
 */

import { EventEmitter } from 'node:events';
import {
  WorkflowPlan,
  WorkflowStep,
  WorkflowTransition,
  WorkflowContext,
  WorkflowState,
  StepType,
  WorkflowResult,
} from '../types/workflow.js';
import { WorkflowEvent } from '../types/state-machine.js';
import { RiskLevel } from '../types/safety.js';
import { IToolExecutor, ToolExecutionRequest } from '../types/tool.js';
import { CompensationAction } from '../types/error-recovery.js';
import { StateMachine } from '../state-machine/StateMachine.js';
import { SafetyGate } from '../safety/SafetyGate.js';
import { ErrorRecoveryEngine } from '../recovery/ErrorRecoveryEngine.js';

export class WorkflowOrchestrator extends EventEmitter {
  private stateMachine!: StateMachine;
  private safetyGate: SafetyGate;
  private toolExecutor: IToolExecutor;
  private recoveryEngine: ErrorRecoveryEngine;
  private pendingApprovalResolvers: Map<
    string,
    { resolve: (approved: boolean) => void; reject: (err: unknown) => void }
  > = new Map();
  private executedCompensations: CompensationAction[] = [];

  constructor(
    toolExecutor: IToolExecutor,
    safetyGate?: SafetyGate,
    recoveryEngine?: ErrorRecoveryEngine
  ) {
    super();
    this.toolExecutor = toolExecutor;
    this.safetyGate = safetyGate ?? new SafetyGate();
    this.recoveryEngine = recoveryEngine ?? new ErrorRecoveryEngine();
  }

  public getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  public getSafetyGate(): SafetyGate {
    return this.safetyGate;
  }

  public getToolExecutor(): IToolExecutor {
    return this.toolExecutor;
  }

  public getRecoveryEngine(): ErrorRecoveryEngine {
    return this.recoveryEngine;
  }

  /**
   * Submit human approval decision for a step currently paused in AWAITING_APPROVAL
   */
  public submitApproval(stepId: string, approved: boolean, reason?: string): void {
    const resolver = this.pendingApprovalResolvers.get(stepId);
    if (!resolver) {
      throw new Error(`No pending approval found for step '${stepId}'`);
    }

    this.pendingApprovalResolvers.delete(stepId);
    resolver.resolve(approved);

    const pending = this.safetyGate.getPendingApprovals().find((a) => a.stepId === stepId);
    if (pending) {
      this.safetyGate.submitDecision({
        approvalId: pending.approvalId,
        workflowId: pending.workflowId,
        approved,
        decidedBy: 'USER',
        decidedAt: Date.now(),
        reason,
      });
    }
  }

  /**
   * Execute complete workflow from start to finish
   */
  public async executeWorkflow(
    definition: WorkflowPlan,
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    this.executedCompensations = [];
    this.stateMachine = new StateMachine(context, WorkflowState.IDLE);

    // Forward state transitions to orchestrator events
    this.stateMachine.on('transition', (data) => this.emit('stateTransition', data));

    const executedSteps: string[] = [];
    let currentStepId: string | undefined = definition.initialStepId;
    let stepCount = 0;
    const maxSteps = definition.maxExecutionSteps ?? 50;

    try {
      await this.stateMachine.transition(WorkflowEvent.START);

      while (currentStepId && stepCount < maxSteps) {
        stepCount++;
        const step = definition.steps.find((s) => s.id === currentStepId);

        if (!step) {
          throw new Error(`Step '${currentStepId}' was not found in workflow definition`);
        }

        context.currentStepId = step.id;
        this.emit('stepStarted', { stepId: step.id, stepName: step.name, stepType: step.type });

        // Execute the step with state transitions & safety gates
        const stepSuccess = await this.executeStep(step, context);

        if (!stepSuccess) {
          throw new Error(`Step '${step.id}' execution failed`);
        }

        executedSteps.push(step.id);
        this.emit('stepFinished', { stepId: step.id, stepName: step.name });

        // Determine next step from transitions
        currentStepId = this.evaluateNextStep(step.id, definition.transitions, context);
      }

      if (stepCount >= maxSteps) {
        throw new Error(`Workflow exceeded maximum execution step limit of ${maxSteps}`);
      }

      // Transition to final RESPONDING -> COMPLETED
      if (this.stateMachine.getState() !== WorkflowState.RESPONDING) {
        if (this.stateMachine.canTransition(WorkflowEvent.RESPOND)) {
          await this.stateMachine.transition(WorkflowEvent.RESPOND);
        }
      }

      if (this.stateMachine.canTransition(WorkflowEvent.COMPLETE)) {
        await this.stateMachine.transition(WorkflowEvent.COMPLETE);
      }

      const endTime = Date.now();
      const result: WorkflowResult = {
        workflowId: context.workflowId,
        finalState: this.stateMachine.getState(),
        success: true,
        startTime,
        endTime,
        durationMs: endTime - startTime,
        executedSteps,
        outputs: { ...context.variables, ...context.stepResults },
        context,
      };

      this.emit('workflowCompleted', result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logs.push({
        timestamp: Date.now(),
        level: 'ERROR',
        message: `Workflow aborted due to error: ${error.message}`,
      });

      // Execute Saga pattern compensations in reverse order
      if (this.executedCompensations.length > 0) {
        await this.recoveryEngine.executeCompensations(
          this.executedCompensations,
          context,
          this.toolExecutor
        );
      }

      if (this.stateMachine.canTransition(WorkflowEvent.FAIL)) {
        await this.stateMachine.transition(WorkflowEvent.FAIL, { error: error.message });
      }

      const endTime = Date.now();
      const result: WorkflowResult = {
        workflowId: context.workflowId,
        finalState: this.stateMachine.getState(),
        success: false,
        startTime,
        endTime,
        durationMs: endTime - startTime,
        executedSteps,
        outputs: { ...context.variables, ...context.stepResults },
        error: {
          stepId: context.currentStepId,
          message: error.message,
          code: 'WORKFLOW_EXECUTION_FAILURE',
          stack: error.stack,
        },
        context,
      };

      this.emit('workflowFailed', result);
      return result;
    }
  }

  /**
   * Executes a single workflow step respecting state machine transitions and safety gates
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    switch (step.type) {
      case StepType.OBSERVATION:
        return this.executeObservationStep(step, context);

      case StepType.REASONING:
        return this.executeReasoningStep(step, context);

      case StepType.PLANNING:
        return this.executePlanningStep(step, context);

      case StepType.TOOL_EXECUTION:
        return this.executeToolStep(step, context);

      case StepType.VERIFICATION:
        return this.executeVerificationStep(step, context);

      case StepType.RESPONSE:
        return this.executeResponseStep(step, context);

      case StepType.HUMAN_APPROVAL:
        return this.executeApprovalStep(step, context);

      default:
        return this.executeToolStep(step, context);
    }
  }

  private async executeObservationStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    if (this.stateMachine.canTransition(WorkflowEvent.OBSERVE)) {
      await this.stateMachine.transition(WorkflowEvent.OBSERVE);
    }

    if (step.toolName) {
      await this.runToolWithRetry(step, context);
    } else {
      // Default observation populates available context
      context.stepResults[step.id] = {
        screenContext: context.appContext.visibleContent ?? 'Screen text captured',
        activeApp: context.appContext.activeApplication ?? 'VS Code',
      };
    }

    if (this.stateMachine.canTransition(WorkflowEvent.OBSERVE_DONE)) {
      await this.stateMachine.transition(WorkflowEvent.OBSERVE_DONE);
    }
    return true;
  }

  private async executeReasoningStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    if (this.stateMachine.canTransition(WorkflowEvent.REASON)) {
      await this.stateMachine.transition(WorkflowEvent.REASON);
    }

    if (step.toolName) {
      await this.runToolWithRetry(step, context);
    } else {
      context.stepResults[step.id] = {
        intent: context.userRequest.intent ?? 'task_execution',
        reasoning: `Analyzed user request '${context.userRequest.rawVoiceInput ?? context.userRequest.intent}' with active context`,
      };
    }

    if (this.stateMachine.canTransition(WorkflowEvent.REASON_DONE)) {
      await this.stateMachine.transition(WorkflowEvent.REASON_DONE);
    }
    return true;
  }

  private async executePlanningStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    if (this.stateMachine.canTransition(WorkflowEvent.PLAN)) {
      await this.stateMachine.transition(WorkflowEvent.PLAN);
    }

    if (step.toolName) {
      await this.runToolWithRetry(step, context);
    } else {
      context.stepResults[step.id] = {
        plan: `Plan decomposed for ${step.name}`,
        readyForTool: true,
      };
    }

    if (this.stateMachine.canTransition(WorkflowEvent.PLAN_DONE)) {
      await this.stateMachine.transition(WorkflowEvent.PLAN_DONE);
    }
    return true;
  }

  private async executeToolStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    if (!step.toolName) {
      throw new Error(`Step '${step.id}' is of type TOOL_EXECUTION but has no toolName specified`);
    }

    const toolDef = this.toolExecutor.getTool(step.toolName);
    const riskLevel = step.riskLevel ?? toolDef?.riskLevel ?? RiskLevel.B_LOW_RISK;
    const resolvedParams = this.resolveParameters(step, context);

    // Evaluate Safety Gate
    const approvalCheck = this.safetyGate.evaluate(
      context.workflowId,
      step.id,
      step.toolName,
      riskLevel,
      resolvedParams,
      step.description
    );

    if (approvalCheck.requiresApproval) {
      if (this.stateMachine.canTransition(WorkflowEvent.REQUIRE_APPROVAL)) {
        await this.stateMachine.transition(WorkflowEvent.REQUIRE_APPROVAL, approvalCheck.approvalRequest);
      }

      this.emit('approvalRequested', approvalCheck.approvalRequest);

      // Wait for approval response
      const approved = await new Promise<boolean>((resolve, reject) => {
        this.pendingApprovalResolvers.set(step.id, { resolve, reject });
      });

      if (!approved) {
        context.logs.push({
          timestamp: Date.now(),
          level: 'WARN',
          message: `User rejected execution of tool '${step.toolName}' in step '${step.id}'`,
        });

        if (this.stateMachine.canTransition(WorkflowEvent.REJECT)) {
          await this.stateMachine.transition(WorkflowEvent.REJECT);
        }

        // Try fallback if available
        if (step.fallbackAction) {
          const fallback = await this.recoveryEngine.handleFallback(
            step,
            new Error('User rejected approval request'),
            context
          );
          if (fallback.handled && fallback.output) {
            context.stepResults[step.id] = fallback.output;
            return true;
          }
        }
        return false;
      }

      if (this.stateMachine.canTransition(WorkflowEvent.APPROVE)) {
        await this.stateMachine.transition(WorkflowEvent.APPROVE);
      }
    } else {
      if (this.stateMachine.canTransition(WorkflowEvent.EXECUTE_TOOL)) {
        await this.stateMachine.transition(WorkflowEvent.EXECUTE_TOOL);
      }
    }

    // Run tool execution with retry policy
    const result = await this.runToolWithRetry(step, context, resolvedParams, riskLevel);

    if (result.success) {
      if (this.stateMachine.canTransition(WorkflowEvent.TOOL_SUCCESS)) {
        await this.stateMachine.transition(WorkflowEvent.TOOL_SUCCESS);
      }

      // Register compensation action if defined (for rollback)
      if (step.compensationAction) {
        this.executedCompensations.push(step.compensationAction);
      }
      return true;
    } else {
      if (this.stateMachine.canTransition(WorkflowEvent.TOOL_FAILURE)) {
        await this.stateMachine.transition(WorkflowEvent.TOOL_FAILURE, result.error);
      }
      return false;
    }
  }

  private async executeVerificationStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    if (this.stateMachine.canTransition(WorkflowEvent.VERIFY)) {
      await this.stateMachine.transition(WorkflowEvent.VERIFY);
    }

    context.stepResults[step.id] = {
      verified: true,
      timestamp: Date.now(),
    };

    if (this.stateMachine.canTransition(WorkflowEvent.VERIFY_SUCCESS)) {
      await this.stateMachine.transition(WorkflowEvent.VERIFY_SUCCESS);
    }
    return true;
  }

  private async executeResponseStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    if (this.stateMachine.canTransition(WorkflowEvent.RESPOND)) {
      await this.stateMachine.transition(WorkflowEvent.RESPOND);
    }

    if (step.toolName) {
      await this.runToolWithRetry(step, context);
    } else {
      context.stepResults[step.id] = {
        responseDelivered: true,
        text: `Completed workflow tasks successfully.`,
      };
    }

    if (this.stateMachine.canTransition(WorkflowEvent.RESPOND_DONE)) {
      await this.stateMachine.transition(WorkflowEvent.RESPOND_DONE);
    }
    return true;
  }

  private async executeApprovalStep(step: WorkflowStep, context: WorkflowContext): Promise<boolean> {
    return this.executeToolStep(step, context);
  }

  /**
   * Run tool execution wrapped with retry policy and fallback handling
   */
  private async runToolWithRetry(
    step: WorkflowStep,
    context: WorkflowContext,
    paramsOverride?: Record<string, unknown>,
    riskOverride?: RiskLevel
  ) {
    const params = paramsOverride ?? this.resolveParameters(step, context);
    const toolDef = this.toolExecutor.getTool(step.toolName!);
    const riskLevel = riskOverride ?? step.riskLevel ?? toolDef?.riskLevel ?? RiskLevel.B_LOW_RISK;

    const executeOperation = async () => {
      const request: ToolExecutionRequest = {
        requestId: `req_${context.workflowId}_${step.id}_${Date.now()}`,
        workflowId: context.workflowId,
        stepId: step.id,
        toolName: step.toolName!,
        parameters: params,
        riskLevel,
        timeoutMs: step.timeoutMs,
      };

      const result = await this.toolExecutor.execute(request);
      if (!result.success) {
        const err = new Error(result.error?.message ?? `Tool '${step.toolName}' failed`);
        (err as { code?: string }).code = result.error?.code;
        throw err;
      }
      return result;
    };

    try {
      let finalResult;
      if (step.retryPolicy) {
        finalResult = await this.recoveryEngine.executeWithRetry(
          executeOperation,
          step.retryPolicy,
          context,
          step.id
        );
      } else {
        finalResult = await executeOperation();
      }

      context.stepResults[step.id] = finalResult.data;
      if (step.outputVariable) {
        context.variables[step.outputVariable] = finalResult.data;
      }
      return finalResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Attempt fallback if configured
      if (step.fallbackAction) {
        const fallback = await this.recoveryEngine.handleFallback(step, error, context);
        if (fallback.handled) {
          if (fallback.output !== undefined) {
            context.stepResults[step.id] = fallback.output;
            if (step.outputVariable) {
              context.variables[step.outputVariable] = fallback.output;
            }
            return { success: true, data: fallback.output, durationMs: 0, timestamp: Date.now(), requestId: 'fallback', toolName: step.toolName! };
          }
        }
      }

      return {
        success: false,
        error: { code: 'STEP_EXECUTION_ERROR', message: error.message, isRetryable: false },
        durationMs: 0,
        timestamp: Date.now(),
        requestId: 'failed',
        toolName: step.toolName!,
      };
    }
  }

  private resolvePath(root: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, part) => {
      if (acc !== null && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, root);
  }

  private resolveParameters(step: WorkflowStep, context: WorkflowContext): Record<string, unknown> {
    if (typeof step.toolParameters === 'function') {
      return step.toolParameters(context);
    }
    if (step.toolParameters) {
      const resolved: Record<string, unknown> = { ...step.toolParameters };
      // Map inputs if specified
      if (step.inputMapping) {
        for (const [paramKey, varPath] of Object.entries(step.inputMapping)) {
          if (varPath.startsWith('variables.')) {
            resolved[paramKey] = this.resolvePath(context.variables, varPath.replace('variables.', ''));
          } else if (varPath.startsWith('stepResults.')) {
            resolved[paramKey] = this.resolvePath(context.stepResults, varPath.replace('stepResults.', ''));
          } else {
            resolved[paramKey] = this.resolvePath(context.variables, varPath);
          }
        }
      }
      return resolved;
    }
    return {};
  }

  private evaluateNextStep(
    currentStepId: string,
    transitions: WorkflowTransition[],
    context: WorkflowContext
  ): string | undefined {
    const matchingTransitions = transitions.filter((t) => t.fromStepId === currentStepId);

    if (matchingTransitions.length === 0) {
      return undefined;
    }

    // Check conditional transitions first
    for (const transition of matchingTransitions) {
      if (transition.condition) {
        if (this.evaluateCondition(transition.condition, context)) {
          return transition.toStepId;
        }
      }
    }

    // Default transition
    const defaultTransition = matchingTransitions.find((t) => t.isDefault || !t.condition);
    return defaultTransition ? defaultTransition.toStepId : undefined;
  }

  private evaluateCondition(cond: NonNullable<WorkflowTransition['condition']>, context: WorkflowContext): boolean {
    if (cond.customEvaluator) {
      return cond.customEvaluator(context);
    }

    if (!cond.field) return true;

    const resolvePath = (root: Record<string, unknown>, path: string): unknown => {
      return path.split('.').reduce<unknown>((acc, part) => {
        if (acc !== null && typeof acc === 'object') {
          return (acc as Record<string, unknown>)[part];
        }
        return undefined;
      }, root);
    };

    let val: unknown;
    if (cond.field.startsWith('variables.')) {
      val = resolvePath(context.variables, cond.field.replace('variables.', ''));
    } else if (cond.field.startsWith('stepResults.')) {
      val = resolvePath(context.stepResults, cond.field.replace('stepResults.', ''));
    } else {
      val = resolvePath(context.variables, cond.field);
    }

    switch (cond.operator) {
      case 'equals':
        return val === cond.value;
      case 'notEquals':
        return val !== cond.value;
      case 'contains':
        return typeof val === 'string' && String(val).includes(String(cond.value));
      case 'greaterThan':
        return typeof val === 'number' && val > Number(cond.value);
      case 'lessThan':
        return typeof val === 'number' && val < Number(cond.value);
      case 'defined':
        return val !== undefined && val !== null;
      default:
        return true;
    }
  }
}
