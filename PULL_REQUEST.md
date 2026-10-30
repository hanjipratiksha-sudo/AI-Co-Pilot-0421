# Pull Request: Agentic Workflow Schemas, State Machine & Mock Tool Executor

**Target Branch:** `team/sde-8-voicebot`  
**Author:** SDE-8 Voicebot Engineering Team  
**Title:** `feat(agentic-workflow): workflow schemas, state machine orchestration & mock tool executor`  
**Status:** Ready for Review & Merge  

---

## 📌 Executive Summary

This PR delivers the complete **Agentic Workflow Orchestration Engine** for **Academia - AI Voice Co-Pilot** in alignment with the PRD (v1.0), System Design Document (SDD v1.0), and API Specifications. 

It provides:
1. **Strict TypeScript Workflow Schemas**: Step types, state machine transitions, context definitions, and tool schemas.
2. **Finite State Machine (`StateMachine`)**: Strict transition table, guard conditions, state snapshot history, and lifecycle hooks (`onEnter`, `onExit`, `beforeTransition`, `afterTransition`).
3. **Safety Gate & Human-in-the-Loop Layer**: Risk classification system directly implementing PRD Section 18:
   - **Level A (Informational):** Auto-approved.
   - **Level B (Low-Risk):** Policy-based auto-approval.
   - **Level C (Sensitive):** Requires human confirmation.
   - **Level D (High-Risk/Destructive):** Invariant-protected explicit double-confirmation required.
4. **Mock Tool Executor (`MockToolExecutor`)**: Configurable mock tool simulation with latency delays, failure injection (`failNTimes`, probabilistic failure, timeouts), parameter validation, and audit history.
5. **Workflow Scheduler & Orchestrator**: Concurrency control, queueing, timeout guards, and full agentic reasoning loop (`Observe -> Reason -> Plan -> Act -> Verify -> Respond`).
6. **Error Recovery Engine**: Exponential backoff retries with jitter, fallback routing, and Saga pattern rollback compensation.
7. **Comprehensive Test Suite**: **49 automated tests with 92.59% line coverage and 82.84% branch coverage** (>80% requirement).
8. **Live Demo Suite**: Both interactive CLI runner (`npm run demo`) and interactive Web Dashboard with real-time SSE streaming (`npm run demo:ui`).

---

## 📅 Day-Wise Plan Deliverables Matrix

| Day | Milestone | Deliverable | Status |
|:---|:---|:---|:---:|
| **Days 1–2** | **Design & Schema** | Workflow schemas, state definitions (`WorkflowState`), transitions, tool executor interface, TypeScript type definitions | ✅ Completed |
| **Days 3–4** | **Build Core** | `StateMachine` transition logic & guards, `MockToolExecutor` with latency & failure simulation, `WorkflowScheduler` with queue concurrency, `ErrorRecoveryEngine` (retries + Saga) | ✅ Completed |
| **Days 5–6** | **Test & Polish** | Unit tests for state machine & safety gate, integration tests with executor, UC-07/UC-08/UC-02 workflows, >80% coverage | ✅ Completed (92.6% coverage) |
| **Days 7** | **PR + Demo** | PR documentation (`PULL_REQUEST.md`), CLI demo runner (`npm run demo`), web visualizer dashboard (`npm run demo:ui`), architecture documentation | ✅ Completed |

---

## 🏗️ Architecture & Interaction Diagram

```mermaid
graph TD
    User([User Voice / Screen Context]) --> ContextEngine[Context Engine]
    ContextEngine --> Orchestrator[Workflow Orchestrator]
    
    subgraph StateMachine [Agentic State Machine]
        IDLE --> INITIALIZING
        INITIALIZING --> OBSERVING
        OBSERVING --> REASONING
        REASONING --> PLANNING
        PLANNING --> SafetyCheck{Safety Check}
        SafetyCheck -->|Level C/D Sensitive| AWAITING_APPROVAL[AWAITING_APPROVAL]
        AWAITING_APPROVAL -->|User Approves| EXECUTING_TOOL
        SafetyCheck -->|Level A/B Safe| EXECUTING_TOOL[EXECUTING_TOOL]
        EXECUTING_TOOL -->|Tool Success| VERIFYING[VERIFYING]
        EXECUTING_TOOL -->|Tool Failure| RECOVERING[RECOVERING]
        RECOVERING -->|Retry / Fallback| EXECUTING_TOOL
        RECOVERING -->|Exhausted| FAILED[FAILED]
        VERIFYING --> RESPONDING[RESPONDING]
        RESPONDING --> COMPLETED[COMPLETED]
    end
    
    subgraph ToolSubsystem [Mock Tool Executor & Safety Gate]
        SafetyGate[Safety Gate (Levels A-D)]
        ToolRegistry[Tool Registry & Validator]
        MockExecutor[Mock Tool Executor]
        AuditLog[(Execution Audit Log)]
    end
    
    Orchestrator --> StateMachine
    Orchestrator --> SafetyGate
    Orchestrator --> MockExecutor
    MockExecutor --> AuditLog
```

---

## 🧪 Acceptance Criteria Verification

| Requirement | Acceptance Criterion | Result | Evidence |
|:---|:---|:---:|:---|
| **Schemas** | Workflow schemas compile without errors | **PASS** | `npm run build` exits with code 0 under TypeScript strict mode (`ES2022`/`NodeNext`). |
| **State Machine** | State machine handles all transitions correctly | **PASS** | Validated across 8 state machine unit tests covering guards, hooks, snapshots, pause/resume, abort, and resets. |
| **Tool Executor** | Tool executor is mockable and testable | **PASS** | 10 unit tests covering schema validation, simulated latency, timeout simulation, `failNTimes`, and custom mock handlers. |
| **Test Coverage** | Test coverage >80% | **PASS** | **Statements: 92.59%**, **Lines: 92.59%**, **Functions: 92.53%**, **Branches: 82.84%** (Vitest v8 threshold enforced). |
| **Error Recovery** | Error recovery paths work as expected | **PASS** | Exponential backoff retries, alternative step fallbacks, and reverse Saga rollback compensations tested and verified. |
| **Documentation** | Documentation complete | **PASS** | `README.md`, `ARCHITECTURE.md`, `API.md`, and `PULL_REQUEST.md` created. |

---

## 📊 Automated Test & Coverage Summary

```text
 ✓ tests/safety-gate.test.ts (7 tests)
 ✓ tests/state-machine.test.ts (8 tests)
 ✓ tests/tool-executor.test.ts (10 tests)
 ✓ tests/error-recovery.test.ts (7 tests)
 ✓ tests/workflow-orchestrator.test.ts (11 tests)
 ✓ tests/scheduler.test.ts (6 tests)

 Test Files  6 passed (6)
      Tests  49 passed (49)

Coverage Report (v8):
===================================================
File                     % Stmts  % Branch  % Funcs  % Lines
---------------------------------------------------
All files                  92.59     82.84    92.53    92.59
 recovery/ErrorRecoveryEngine 99.40     85.29   100.00    99.40
 safety/SafetyGate         95.12     94.87    91.66    95.12
 scheduler/WorkflowScheduler 100.00   85.71   100.00   100.00
 scheduler/WorkflowOrchestrator 89.83 75.19    95.83    89.83
 state-machine/StateMachine 93.30     83.33    90.90    93.30
 state-machine/TransitionTable 96.46 100.00    77.77    96.46
 tools/ToolRegistry        95.18     90.62   100.00    95.18
 tools/MockToolExecutor    79.45     75.00    90.90    79.45
 tools/built-in-tools     100.00    100.00   100.00   100.00
 workflows/WorkflowBuilder 93.65     92.30    86.66    93.65
 workflows/predefined-workflows 100.00 66.66  100.00   100.00
===================================================
```

---

## 🎬 How to Run the Live Demos

### 1. Terminal CLI Live Demo
```bash
npm run demo
```
Runs the 4 PRD live scenarios:
- **Scenario 1:** UC-07 Multi-Step Reasoning (`file_search` -> `file_read` -> `summarize_text`)
- **Scenario 2:** UC-08 Human-in-the-Loop Safety Gate (Level D `file_delete` requires explicit user confirmation)
- **Scenario 3:** Transient Network/Filesystem Failure with Exponential Backoff Recovery
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
- [x] All 49 unit and integration tests pass cleanly.
- [x] Code coverage exceeds the 80% threshold across statements, branches, lines, and functions.
- [x] TypeScript compiler passes in strict mode (`npm run build`).
- [x] Safety invariants enforced (Level D destructive actions can never be bypassed).
- [x] Predefined workflows match PRD use cases UC-01, UC-02, UC-07, and UC-08.
- [x] Ready to merge into `team/sde-8-voicebot`.
