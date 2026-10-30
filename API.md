# API Specifications & Interface Contracts

**Product:** Academia AI Voice Co-Pilot  
**Component:** Agentic Workflow & Tool Orchestration Layer  
**Document Version:** 1.0  

---

## 1. REST API Contracts (Aligned with SDD Section 04)

### 1.1 Execute Tool Action
Requests execution of a registered tool with parameters and safety verification.

- **Endpoint:** `POST /api/v1/tools/execute`
- **Headers:** `Content-Type: application/json`

#### Request Payload
```json
{
  "workflow_id": "wf_pdf_summarize",
  "step_id": "step_read",
  "tool_name": "file_read",
  "parameters": {
    "filePath": "documents/quarterly_report.pdf",
    "maxBytes": 1048576
  },
  "risk_level": "B_LOW_RISK"
}
```

#### Successful Response (`200 OK`)
```json
{
  "request_id": "req_17932840001",
  "tool_name": "file_read",
  "success": true,
  "data": {
    "content": "# Quarterly Research Report\nKey Findings: ...",
    "pages": 14,
    "mimeType": "application/pdf"
  },
  "duration_ms": 42,
  "timestamp": 17932840001
}
```

#### Standard Error Response (`400 Bad Request` / `500 Server Error`)
```json
{
  "error": {
    "code": "PARAM_VALIDATION_ERROR",
    "message": "Validation failed for tool 'file_read': Missing required parameter 'filePath'",
    "request_id": "req_17932840002"
  }
}
```

---

### 1.2 Submit Human Approval Decision
Submits a user or policy decision for an action paused in `AWAITING_APPROVAL`.

- **Endpoint:** `POST /api/v1/approvals`
- **Headers:** `Content-Type: application/json`

#### Request Payload
```json
{
  "approval_id": "appr_wf_cleanup_step_delete_file_17932840000",
  "workflow_id": "wf_cleanup",
  "step_id": "step_delete_file",
  "approved": true,
  "decided_by": "USER",
  "reason": "User confirmed permanent deletion of temporary cache files"
}
```

#### Response (`200 OK`)
```json
{
  "status": "decision_recorded",
  "approval_id": "appr_wf_cleanup_step_delete_file_17932840000",
  "workflow_id": "wf_cleanup",
  "resumed_state": "EXECUTING_TOOL"
}
```

---

## 2. TypeScript Programmatic API

### 2.1 `StateMachine`
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

### 2.2 `SafetyGate`
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
  'file_delete',
  RiskLevel.D_HIGH_RISK_DESTRUCTIVE,
  { filePath: '/temp/cache.tmp' }
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

### 2.3 `MockToolExecutor`
Executes tool requests with configurable simulated conditions.

```typescript
import { MockToolExecutor } from 'voicebot-agentic-workflow';

const executor = new MockToolExecutor();

// Configure simulated behavior
executor.configureMock('browser_search', {
  simulatedLatencyMs: 50,
  failNTimes: 2, // Fails 2 times before succeeding
  failureErrorCode: 'TRANSIENT_TIMEOUT',
});

// Execute tool
const result = await executor.execute({
  requestId: 'req_1',
  workflowId: 'wf_1',
  stepId: 's1',
  toolName: 'browser_search',
  parameters: { query: 'LangGraph' },
  riskLevel: RiskLevel.B_LOW_RISK,
});
```

---

### 2.4 `WorkflowOrchestrator`
Coordinates multi-step workflow execution across state machine, safety gates, and tools.

```typescript
import { WorkflowOrchestrator, createPdfSummarizeWorkflow } from 'voicebot-agentic-workflow';

const orchestrator = new WorkflowOrchestrator(executor, safetyGate);
const workflowDef = createPdfSummarizeWorkflow();

// Handle real-time approval events
orchestrator.on('approvalRequested', (req) => {
  // Show UI confirmation to user...
  orchestrator.submitApproval(req.stepId, true);
});

// Execute complete workflow
const result = await orchestrator.executeWorkflow(workflowDef, context);
console.log('Final outputs:', result.outputs);
```
