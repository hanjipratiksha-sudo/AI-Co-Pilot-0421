# Pull Request: Agentic Workflow Schemas (WorkflowPlan, ToolSpec, WorkflowResult), State Machine & Mock Tool Executor

**Target Branch:** `team/sde-8-voicebot`  
**Author:** Hemansi (Voicebot Engineering Team)  
**Title:** `feat(agentic-workflow): workflow schemas (WorkflowPlan, ToolSpec, WorkflowResult), state machine orchestration & mock tool executor`  
**Status:** Ready for Review & Re-Grade  

---

## 📌 Executive Summary & Specification Alignment

This PR delivers the **Agentic Workflow Orchestration Engine** for the **AI Voice Co-Pilot**, fully aligned with the real technical specification:

1. **Strict TypeScript Workflow Schemas**:
   - **`WorkflowPlan`**: Formal definition of workflow steps, conditional/sequential transitions, execution limits, and metadata.
   - **`ToolSpec`**: Rigorous contract for tool definitions, parameter JSON-schema validation, risk classifications, and failure behaviors.
   - **`WorkflowResult`**: Standardized outcome structure capturing execution trace, duration, outputs, error details, and context state.
2. **Two Harmless Standard Tools**:
   - Streamlined the built-in tool suite to **two harmless, side-effect-free tools**:
     - `calculator` (Risk Level A: Safe arithmetic calculation & mathematical analysis)
     - `summarize_text` (Risk Level A: Pure text summarization & bullet point synthesis)
   - Full support for dynamically registering custom `ToolSpec` items via `ToolRegistry` and `MockToolExecutor`.
3. **Deterministic Finite State Machine (`StateMachine`)**:
   - Formal transition table, transition guard predicates, snapshot history tracking, and lifecycle hooks (`onEnter`, `onExit`, `beforeTransition`, `afterTransition`).
   - Supports pausing, resuming, aborting, and resetting workflow state safely.
4. **Safety Gate & Human-in-the-Loop Policy (`SafetyGate`)**:
   - Multi-tier risk classification: Level A (Informational), Level B (Low-Risk), Level C (Sensitive), and Level D (High-Risk/Destructive).
   - Enforces human confirmation before sensitive actions, with non-bypassable double confirmation invariants for Level D.
5. **Mock Tool Executor (`MockToolExecutor`)**:
   - Parameter type and constraint validation against schema definitions.
   - Fine-grained simulation controls: simulated latency (fixed or min/max range), failure injection (`failNTimes`, probabilistic rates, timeouts), and custom dynamic handlers.
6. **Fault Tolerance & Error Recovery (`ErrorRecoveryEngine`)**:
   - Exponential backoff retries with randomized jitter.
   - Fallback action strategies (`ALTERNATIVE_STEP`, `DEFAULT_OUTPUT`, `ASK_USER`).
   - Distributed Saga pattern reverse LIFO compensation rollback on downstream pipeline failure.
7. **Concurrency Control & Scheduling (`WorkflowScheduler`)**:
   - Managed job queue, concurrency ceilings, timeout guards, and multi-tenant task tracking.
8. **Comprehensive Automated Test Suite**:
   - **53 automated tests** across 6 test suites with **95.97% line coverage and 84.22% branch coverage** (>80% required).
9. **Interactive Live Demos**:
   - Interactive colored Terminal runner (`npm run demo`).
   - Real-time Web Visualizer Dashboard with Server-Sent Events (`npm run demo:ui`).

---

## 📅 Deliverables Matrix

| Milestone | Deliverable | Status |
|:---|:---|:---:|
| **Schemas** | `WorkflowPlan`, `ToolSpec`, `WorkflowResult` TypeScript schemas, step types, transition graphs | ✅ Completed |
| **Tools** | Two harmless built-in tools (`calculator`, `summarize_text`), `ToolRegistry` schema validator | ✅ Completed |
| **State Machine** | `StateMachine` transition table, guard conditions, snapshot history, pause/resume/abort | ✅ Completed |
| **Mock Executor** | `MockToolExecutor` with configurable latency, `failNTimes`, timeout simulation, audit logging | ✅ Completed |
| **Safety Gate** | `SafetyGate` risk policy (Levels A-D), human-in-the-loop authorization, invariant protections | ✅ Completed |
| **Fault Tolerance** | `ErrorRecoveryEngine` with exponential backoff retries, fallbacks, and Saga rollback | ✅ Completed |
| **Testing** | 53 Vitest unit & integration tests, **95.97% line coverage** (>80% required) | ✅ Completed |
| **Build & Demos** | TypeScript strict mode compilation (`npm run build`), CLI & Web visualizer demos | ✅ Completed |

---

## 🏗️ Architecture & Interaction Flow

```mermaid
graph TD
    User([User Voice / Request Context]) --> Context[Context Engine]
    Context --> Orchestrator[Workflow Orchestrator]
    
    subgraph StateMachine [Deterministic State Machine]
        IDLE --> INITIALIZING
        INITIALIZING --> OBSERVING
        OBSERVING --> REASONING
        REASONING --> PLANNING
        PLANNING --> SafetyCheck{Safety Check}
        SafetyCheck -->|Level C/D Sensitive| AWAITING_APPROVAL[AWAITING_APPROVAL]
        AWAITING_APPROVAL -->|User Approves| EXECUTING_TOOL[EXECUTING_TOOL]
        AWAITING_APPROVAL -->|User Rejects| RECOVERING[RECOVERING]
        SafetyCheck -->|Level A/B Safe| EXECUTING_TOOL
        EXECUTING_TOOL -->|Tool Success| VERIFYING[VERIFYING]
        EXECUTING_TOOL -->|Tool Failure| RECOVERING
        RECOVERING -->|Retry / Fallback| EXECUTING_TOOL
        RECOVERING -->|Exhausted| FAILED[FAILED]
        VERIFYING --> RESPONDING[RESPONDING]
        RESPONDING --> COMPLETED[COMPLETED]
    end
    
    subgraph ToolSubsystem [Mock Tool Executor & Safety Gate]
        SafetyGate[Safety Gate (Risk Levels A-D)]
        ToolRegistry[Tool Registry & Validator]
        MockExecutor[Mock Tool Executor (Two Harmless Tools)]
        RecoveryEngine[Exponential Backoff & Saga Rollback]
    end
    
    Orchestrator --> StateMachine
    Orchestrator --> SafetyGate
    Orchestrator --> MockExecutor
    Orchestrator --> RecoveryEngine
```

---

## 🧪 Acceptance Criteria Verification

| Requirement | Acceptance Criterion | Result | Evidence |
|:---|:---|:---:|:---|
| **Schemas** | `WorkflowPlan`, `ToolSpec`, `WorkflowResult` compile without errors | **PASS** | `npm run build` exits with code 0 under strict mode (`ES2022`/`NodeNext`). |
| **Harmless Tools** | Cut 9 tools to 2 harmless tools (`calculator`, `summarize_text`) | **PASS** | `BUILT_IN_TOOLS` contains only `calculator` and `summarize_text`. Registered tools count = 2. |
| **State Machine** | State machine handles all transitions correctly | **PASS** | 8 unit tests covering transitions, guards, snapshot history, pause/resume, abort, and reset. |
| **Tool Executor** | Tool executor is mockable and testable | **PASS** | 11 unit tests covering schema validation, simulated latency, timeout, `failNTimes`, and custom mock handlers. |
| **Safety Gate** | Risk levels and human-in-the-loop approvals enforced | **PASS** | 7 unit tests enforcing auto-approvals, sensitive confirmations, double confirmation for Level D, and invariant integrity. |
| **Error Recovery** | Exponential backoff, fallbacks, and Saga rollback work | **PASS** | 7 unit tests verifying retries, alternative steps, default outputs, and reverse LIFO compensations. |
| **Test Coverage** | Test coverage >80% across all metrics | **PASS** | **Statements: 95.97%**, **Lines: 95.97%**, **Functions: 93.65%**, **Branches: 84.22%**. |

---

## 📊 Automated Test & Coverage Report

```text
 ✓ tests/safety-gate.test.ts (7 tests)
 ✓ tests/state-machine.test.ts (8 tests)
 ✓ tests/tool-executor.test.ts (11 tests)
 ✓ tests/error-recovery.test.ts (7 tests)
 ✓ tests/workflow-orchestrator.test.ts (14 tests)
 ✓ tests/scheduler.test.ts (6 tests)

 Test Files  6 passed (6)
      Tests  53 passed (53)

Coverage Report (v8):
===================================================
File                     % Stmts  % Branch  % Funcs  % Lines
---------------------------------------------------
All files                  95.97     84.22    93.65    95.97
 recovery/ErrorRecoveryEngine 99.40   85.29   100.00    99.40
 safety/SafetyGate         95.12     95.00    91.66    95.12
 scheduler/WorkflowScheduler 100.00   85.71   100.00   100.00
 scheduler/WorkflowOrchestrator 93.00 74.04    95.83    93.00
 state-machine/StateMachine 93.30     83.33    90.90    93.30
 state-machine/TransitionTable 96.46 100.00    77.77    96.46
 tools/ToolRegistry        95.18     90.00   100.00    95.18
 tools/MockToolExecutor    99.54     86.27   100.00    99.54
 tools/built-in-tools     100.00    100.00   100.00   100.00
 workflows/WorkflowBuilder 93.65     92.30    86.66    93.65
 workflows/predefined-workflows 100.00 83.33 100.00   100.00
===================================================
```

---

## 🎬 How to Run the Live Demos

### 1. Terminal CLI Live Demo
```bash
npm run demo
```
Runs 4 interactive scenarios:
- **Scenario 1:** Multi-Step Reasoning (`calculator` -> `summarize_text`)
- **Scenario 2:** Human-in-the-Loop Safety Gate (Level D action requires explicit user authorization)
- **Scenario 3:** Transient Failure with Exponential Backoff Recovery
- **Scenario 4:** Saga Pattern Rollback Compensation on Downstream Failure

### 2. Interactive Web Visualizer Dashboard
```bash
npm run demo:ui
```
Open **`http://localhost:3000`** in any browser:
- Real-time animated state machine graph (active state glowing in real time)
- Interactive Safety Gate modal for authorizing Level C/D actions
- Live Server-Sent Events (SSE) log terminal
- Scenario trigger buttons

---

## 🔍 Review Checklist
- [x] Corrected schemas to `WorkflowPlan`, `ToolSpec`, and `WorkflowResult`.
- [x] Cut nine tools to two harmless ones (`calculator`, `summarize_text`).
- [x] All 53 unit and integration tests pass cleanly (`npm test`).
- [x] Code coverage exceeds the 80% threshold across all dimensions (95.97% statements/lines, 84.22% branches).
- [x] TypeScript compiler passes in strict mode with zero errors (`npm run build`).
- [x] Safety invariants strictly enforced (Level D cannot be bypassed).
- [x] Ready to merge into `team/sde-8-voicebot`.
