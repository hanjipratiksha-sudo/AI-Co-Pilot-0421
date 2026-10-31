# API Specifications & Interface Contracts

**Product:** AI Voice Co-Pilot  
**Component:** Agentic Workflow & Tool Orchestration Layer  
**Document Version:** 1.1  

---

## 1. REST API Contracts

### 1.1 Execute Tool Action
Requests execution of a registered tool with parameters and safety verification.

- **Endpoint:** `POST /api/v1/tools/execute`
- **Headers:** `Content-Type: application/json`

#### Request Payload
```json
{
  "workflow_id": "wf_calc_summarize",
  "step_id": "step_calc",
  "tool_name": "calculator",
  "parameters": {
    "expression": "(25 * 4) + 150"
  },
  "risk_level": "A_INFORMATIONAL"
}
```

#### Successful Response (`200 OK`)
```json
{
  "request_id": "req_17932840001",
  "tool_name": "calculator",
  "success": true,
  "data": {
    "expression": "(25 * 4) + 150",
    "result": 250
  },
  "duration_ms": 12,
  "timestamp": 17932840001
}
```

#### Standard Error Response (`400 Bad Request` / `500 Server Error`)
```json
{
  "error": {
    "code": "PARAM_VALIDATION_ERROR",
    "message": "Validation failed for tool 'calculator': Missing required parameter 'expression'",
    "request_id": "req_17932840002"
  }
}
```

---

### 1.2 Submit Human Approval Decision
Submits a user decision for an action paused in `AWAITING_APPROVAL`.

- **Endpoint:** `POST /api/v1/approvals`
- **Headers:** `Content-Type: application/json`

#### Request Payload
```json
{
  "approval_id": "appr_wf_action_step_action_17932840000",
  "workflow_id": "wf_controlled_action",
  "step_id": "step_action",
  "approved": true,
  "decided_by": "USER",
  "reason": "User confirmed sensitive action authorization"
}
```

#### Response (`200 OK`)
```json
{
  "status": "decision_recorded",
  "approval_id": "appr_wf_action_step_action_17932840000",
  "workflow_id": "wf_controlled_action",
  "resumed_state": "EXECUTING_TOOL"
}
```

---

## 2. TypeScript Programmatic API

### 2.1 Core Schemas
- **`WorkflowPlan`**: Formal declaration of steps, transitions, timeout, and execution bounds.
- **`ToolSpec`**: Specification of tool properties, input schemas, risk classification, and failure policies.
- **`WorkflowResult`**: Outcome of a completed, failed, or aborted workflow run.

```typescript
import type { WorkflowPlan, ToolSpec, WorkflowResult } from 'voicebot-agentic-workflow';
```

---

### 2.2 `StateMachine`
Manages state machine transitions, guards, snapshot recording, and lifecycle hooks.

```typescript
import { StateMachine, WorkflowState, WorkflowEvent } from 'voicebot-agentic-workflow';

const sm = new StateMachine(context, WorkflowState.IDLE);

// Transition to next state
await sm.transition(WorkflowEvent.START);

// Lifecycle hooks
sm.onEnter(WorkflowState.AWAITING_APPROVAL, (state, ctx) => {
  console.log('Paused for human approval:', ctx.currentStepId);
});

// Pause / Resume
await sm.pause();
await sm.resume();

// Snapshot inspection
const history = sm.getHistory();
```

---

### 2.3 `SafetyGate`
Enforces risk boundaries, policy permissions, and approval requirements.

```typescript
import { SafetyGate, RiskLevel } from 'voicebot-agentic-workflow';

const gate = new SafetyGate({
  autoApproveLevelA: true,
  autoApproveLevelB: true,
  autoApproveLevelC: false,
});

// Check requirement
const evalResult = gate.evaluate(
  workflowId,
  stepId,
  'summarize_text',
  RiskLevel.D_HIGH_RISK_DESTRUCTIVE,
  { text: 'Sensitive action' }
);

if (evalResult.requiresApproval) {
  console.log(evalResult.approvalRequest?.consequencesSummary);
}

// Submit approval
gate.submitDecision({
  approvalId: evalResult.approvalRequest!.approvalId,
  workflowId,
  approved: true,
  decidedBy: 'USER',
  decidedAt: Date.now(),
});
```

---

### 2.4 `MockToolExecutor`
Executes tool requests with configurable simulated conditions for the 2 standard harmless tools (`calculator`, `summarize_text`) and custom registered `ToolSpec` definitions.

```typescript
import { MockToolExecutor, RiskLevel } from 'voicebot-agentic-workflow';

const executor = new MockToolExecutor();

// Configure simulated behavior
executor.configureMock('calculator', {
  simulatedLatencyMs: 50,
  failNTimes: 2, // Fails 2 times before succeeding
  failureErrorCode: 'TRANSIENT_TIMEOUT',
});

// Execute tool
const result = await executor.execute({
  requestId: 'req_1',
  workflowId: 'wf_1',
  stepId: 's1',
  toolName: 'calculator',
  parameters: { expression: '42 * 2' },
  riskLevel: RiskLevel.A_INFORMATIONAL,
});
```

---

### 2.5 `WorkflowOrchestrator`
Coordinates multi-step workflow execution across state machine, safety gates, and tools.

```typescript
import { WorkflowOrchestrator, createCalculationAndSummaryWorkflow } from 'voicebot-agentic-workflow';

const orchestrator = new WorkflowOrchestrator(executor, safetyGate);
const workflowPlan = createCalculationAndSummaryWorkflow();

// Handle real-time approval events
orchestrator.on('approvalRequested', (req) => {
  // Show UI confirmation to user...
  orchestrator.submitApproval(req.stepId, true);
});

// Execute complete workflow
const result: WorkflowResult = await orchestrator.executeWorkflow(workflowPlan, context);
console.log('Final outputs:', result.outputs);
```
