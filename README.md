# Academia AI Voice Co-Pilot — Agentic Workflow Engine

> **SDE-8 Engineering Team Deliverable**  
> State Machine Orchestration, Workflow Schemas, Safety Gates & Mock Tool Execution System for the Academia AI Voice Co-Pilot.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tests-49%20passed-brightgreen.svg)](https://vitest.dev/)
[![Coverage](https://img.shields.io/badge/Coverage-92.6%25-success.svg)](https://github.com/)
[![Target Branch](https://img.shields.io/badge/Branch-team%2Fsde--8--voicebot-orange.svg)](https://github.com/)

---

## 📖 Overview

The **Agentic Workflow Engine** orchestrates multi-step contextual reasoning and controlled tool invocations for the AI Voice Co-Pilot. Built in adherence to the **Product Requirements Document (PRD v1.0)** and **System Design Document (SDD v1.0)**, the system implements:

- **Agentic Decision Loop**: `Observe` ➔ `Reason` ➔ `Plan` ➔ `Act` ➔ `Verify` ➔ `Respond`
- **Finite State Machine (`StateMachine`)**: Strict transition table, guard conditions, state snapshotting, and lifecycle hooks.
- **Safety & Human-in-the-Loop Gate (`SafetyGate`)**: Enforces risk classifications across Level A (Informational), Level B (Low-Risk), Level C (Sensitive), and Level D (Destructive).
- **Mock Tool Executor (`MockToolExecutor`)**: Pluggable mock simulation with configurable latency, probabilistic failures, `failNTimes` consecutive failure counts, and audit logs.
- **Fault Tolerance Engine (`ErrorRecoveryEngine`)**: Exponential backoff retries with jitter, fallback step routing, and Saga pattern rollback compensations.
- **Workflow Scheduler (`WorkflowScheduler`)**: Job queue management, concurrency limits, step timeouts, and pause/resume/abort controls.

---

## ⚡ Quick Start

### 1. Installation
```bash
npm install
```

### 2. Run Tests & Coverage
```bash
# Run unit and integration tests
npm test

# Run test coverage suite (>80% required)
npm run test:coverage
```

### 3. Run Live Demos
```bash
# 1. Interactive Terminal Demo
npm run demo

# 2. Interactive Web Visualizer Dashboard (http://localhost:3000)
npm run demo:ui
```

### 4. Build TypeScript Distribution Bundle
```bash
npm run build
```

---

## 🏗️ Core Architecture

```mermaid
flowchart TD
    UserQuery([User Voice / Screen Context]) --> Orchestrator[Workflow Orchestrator]

    subgraph StateMachine [State Machine Lifecycle]
        IDLE --> INITIALIZING
        INITIALIZING --> OBSERVING
        OBSERVING --> REASONING
        REASONING --> PLANNING
        PLANNING --> RiskGate{Risk Check}
        
        RiskGate -->|Level C/D| AWAITING_APPROVAL[AWAITING_APPROVAL]
        AWAITING_APPROVAL -->|User Approves| EXECUTING_TOOL[EXECUTING_TOOL]
        AWAITING_APPROVAL -->|User Rejects| RECOVERING[RECOVERING]
        RiskGate -->|Level A/B| EXECUTING_TOOL
        
        EXECUTING_TOOL -->|Tool Success| VERIFYING[VERIFYING]
        EXECUTING_TOOL -->|Tool Failure| RECOVERING
        
        RECOVERING -->|Retry / Fallback| EXECUTING_TOOL
        RECOVERING -->|Exhausted| FAILED[FAILED]
        
        VERIFYING --> RESPONDING[RESPONDING]
        RESPONDING --> COMPLETED[COMPLETED]
    end

    subgraph ExecutionLayer [Tool & Safety Execution]
        SafetyGate[Safety Gate Policy]
        ToolRegistry[Tool Schema Validator]
        MockExecutor[Mock Tool Executor]
        RecoveryEngine[Exponential Backoff & Saga Rollback]
    end

    Orchestrator --> StateMachine
    Orchestrator --> SafetyGate
    Orchestrator --> ToolRegistry
    Orchestrator --> MockExecutor
    Orchestrator --> RecoveryEngine
```

---

## 🛡️ Risk Classification & Human-in-the-Loop Safety

Per PRD Section 18, all agent actions are classified into four risk categories:

| Level | Classification | Examples | Safety Behavior |
|:---:|:---|:---|:---|
| **A** | **Informational** | Explain document, summarize visible screen, answer queries | Auto-approved |
| **B** | **Low-Risk** | Search files, open permitted documents, query app context | Auto-approved by policy |
| **C** | **Sensitive** | Modify file, change application settings, send email | **User confirmation required** |
| **D** | **High-Risk / Destructive** | Delete files, run shell commands, alter credentials | **Explicit double-confirmation required** (cannot be bypassed) |

---

## 🧰 Built-in Standard Tools

| Tool Name | Risk Level | Purpose | Input Parameters |
|:---|:---:|:---|:---|
| `ocr_extract` | Level A | Screen & image text extraction | `{ region?: string, filter?: string }` |
| `summarize_text` | Level A | Executive bullet point summarization | `{ text: string, maxPoints?: number, focus?: string }` |
| `code_analyze` | Level A | Stack trace and error diagnostics | `{ errorMessage: string, codeSnippet?: string, language?: string }` |
| `calculator` | Level A | Arithmetic and numeric calculations | `{ expression: string }` |
| `browser_search` | Level B | Technical search and documentation retrieval | `{ query: string, limit?: number }` |
| `file_search` | Level B | Workspace pattern file discovery | `{ pattern: string, directory?: string }` |
| `file_read` | Level B | Ingest file or document contents | `{ filePath: string, maxBytes?: number }` |
| `file_modify` | Level C | Write or append to target files | `{ filePath: string, content: string, mode?: string }` |
| `file_delete` | Level D | Permanent deletion of workspace files | `{ filePath: string, recursive?: boolean }` |

---

## 🛠️ Mock Tool Executor Configuration

The `MockToolExecutor` allows fine-grained simulation of real-world tool execution conditions:

```typescript
import { MockToolExecutor } from 'voicebot-agentic-workflow';

const executor = new MockToolExecutor();

// 1. Simulate 2 consecutive failures before succeeding (tests retries)
executor.configureMock('browser_search', {
  failNTimes: 2,
  failureErrorCode: 'TRANSIENT_GATEWAY_TIMEOUT',
});

// 2. Simulate network latency
executor.configureMock('file_read', {
  simulatedLatencyMs: { min: 50, max: 200 },
});

// 3. Custom dynamic handler
executor.configureMock('calculator', {
  mockHandler: (params) => ({ result: 42 }),
});
```

---

## 🔄 Programmatic Workflow Composition

Workflows can be constructed using the fluent `WorkflowBuilder`:

```typescript
import { WorkflowBuilder, RiskLevel } from 'voicebot-agentic-workflow';

const workflow = new WorkflowBuilder('wf_custom', 'Custom Analysis')
  .addObservationStep('obs_1', 'Capture Screen Context')
  .addReasoningStep('rsn_1', 'Reason on User Query')
  .addToolStep('search_1', 'Find Documents', 'file_search', { pattern: '*.pdf' }, {
    riskLevel: RiskLevel.B_LOW_RISK,
    outputVariable: 'foundFiles',
    retryPolicy: { maxAttempts: 3, backoffMs: 100, backoffMultiplier: 2 },
  })
  .addResponseStep('resp_1', 'Deliver Voice Response')
  .addSequentialTransitions()
  .build();
```

---

## 🧪 Test Suite & Coverage Metrics

Run `npm run test:coverage` to verify strict adherence to the >80% coverage requirement:

- **Statements:** 92.59%
- **Lines:** 92.59%
- **Functions:** 92.53%
- **Branches:** 82.84%
- **Total Test Cases:** 49 passing tests

---

## 📂 Project Structure

```
voicebot/
├── src/
│   ├── types/               # TypeScript schemas (workflow, safety, tool, error-recovery)
│   ├── state-machine/       # StateMachine & TransitionTable
│   ├── safety/              # SafetyGate (Risk Levels A-D & approval evaluation)
│   ├── tools/               # ToolRegistry, MockToolExecutor & built-in tools
│   ├── recovery/            # ErrorRecoveryEngine (Exponential backoff & Saga rollback)
│   ├── scheduler/           # WorkflowScheduler & WorkflowOrchestrator
│   ├── workflows/           # WorkflowBuilder & predefined workflows (UC-01 to UC-08)
│   ├── demo/
│   │   ├── cli-demo.ts      # Colored terminal demo runner (npm run demo)
│   │   ├── server.ts        # Web dashboard HTTP & SSE server (npm run demo:ui)
│   │   └── public/          # Web dashboard visualizer UI
│   └── index.ts             # Library entrypoint
├── tests/                   # Comprehensive Vitest test suite (49 tests)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── PULL_REQUEST.md          # PR documentation for team/sde-8-voicebot
├── ARCHITECTURE.md          # Technical architecture specification
└── API.md                   # API contract definitions
```
