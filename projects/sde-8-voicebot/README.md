# Team SDE 8: Context & Reasoning Engine
**Project:** Academia - AI Voice Co-Pilot  
**Sprint:** Week 3 (W3 - Context & Reasoning)  
**Git Branch:** `team/sde-8-voicebot`  
**Location:** `projects/sde-8-voicebot/`

---

## 1. Overview
The **Context & Reasoning Engine** serves as the central intelligence bridge between sensory input layers (Voice STT, Screen OCR, Active Application) and downstream action components (Agent Orchestrator, Safety Gate, Voice TTS).

This module implements:
1. **Context Schema Definitions**: Type-safe structures validating User, Application, Screen OCR, and Conversation state.
2. **Privacy Guardrails**: Automatic redaction of sensitive credentials, API keys, and passwords before prompt injection.
3. **Versioned Prompt Management**: Semver-controlled system prompts with persona specialization (Student Developer, Research Student, General User).
4. **Mock Reasoning Service**: High-fidelity simulation of LLM multimodal intent detection, tool routing, and Safety Risk Classification (Levels A–D).
5. **Interactive Demo & Test Suite**: Verifiable against PRD Acceptance Criteria AC-01 through AC-10.

---

## 2. Directory Structure

```text
projects/sde-8-voicebot/
├── prompts/                     # Versioned Prompt Management
│   ├── v1.0.0/
│   │   ├── system.base.md
│   │   ├── persona.developer.md
│   │   ├── persona.researcher.md
│   │   └── persona.general.md
│   └── v1.1.0/
│       └── system.base.md
├── src/
│   ├── schemas/
│   │   ├── context.schema.ts    # Zod & TypeScript context definitions
│   │   └── reasoning.schema.ts  # API contracts (/api/v1/context, /api/v1/ai/chat)
│   ├── core/
│   │   ├── context-manager.ts   # Session state & privacy redaction
│   │   └── prompt-loader.ts     # Versioned template loader
│   ├── services/
│   │   └── mock-reasoning.service.ts # Intent reasoning & Safety Level A-D
│   ├── demo.ts                  # Interactive Live Demo runner
│   └── index.ts                 # Main module exports
├── tests/
│   └── context-and-reasoning.spec.ts # Jest unit & integration tests
├── jest.config.js
├── package.json
└── tsconfig.json
```

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js (v18 or v20 LTS recommended)
- npm or pnpm

### Installation
```bash
cd projects/sde-8-voicebot
npm install
```

### Running the Live Demo
Demonstrates the 3 core PRD personas and the Level C/D safety gates:
```bash
npm run demo
```

### Running Automated Tests
Executes unit tests for schema validation, PII redaction, prompt fallbacks, and reasoning decisions:
```bash
npm test
```

---

## 4. Safety Gate & Risk Classification (PRD Section 18)

| Risk Level | Category | Examples | Approval Required |
|:---:|:---|:---|:---:|
| **Level A** | Informational | Explain code error, explain PDF methodology, trend analysis | **No** |
| **Level B** | Low-Risk Interaction | Search files, query documentation index | **No** (Audit Log) |
| **Level C** | Sensitive Action | Move files, modify settings, draft email | **Yes** (User Prompt) |
| **Level D** | Destructive Action | Delete files, format directories, privileged exec | **Yes** (Explicit Modal) |

---

## 5. Definition of Done (DoD) Checklist

- [x] Context schemas designed and typed with Zod (`context.schema.ts`): `ContextItem`, `SourceReference`.
- [x] Multimodal reasoning interface & contracts (`reasoning.schema.ts`): `ReasoningRequest`, `ReasoningResult`.
- [x] Versioned prompt loader supporting `v1.0.0` & `v1.1.0` with persona overlays.
- [x] Trusted vs. Untrusted prompt separation with delimiter escaping.
- [x] Synthetic frames engine with 4 deterministic frames (`DEV_VSCODE_ERROR`, `RESEARCH_PDF_ATTENTION`, `CONTROLLED_ACTION_FILES`, `PRIVACY_PII_LEAK`).
- [x] PRD Section 19 Privacy Gate: Screen capture strictly disabled (Week 1 allows synthetic frames only, no real screenshots).
- [x] Privacy filter auto-redacting API keys, passwords, and tokens.
- [x] Mock Reasoning Service implementing intent detection & risk gating.
- [x] Unit and integration test suite created (21/21 passing, 100%).
- [x] Interactive live demo created (`demo.ts`).
- [x] Git branch initialized (`team/sde-8-voicebot` and `pratiksha-hanji`).

---

## 6. Pull Request URL & Verification

* **Repository:** [https://github.com/hanjipratiksha-sudo/AI-Co-Pilot-0421](https://github.com/hanjipratiksha-sudo/AI-Co-Pilot-0421)
* **Compare & Pull Request URL:** [https://github.com/hanjipratiksha-sudo/AI-Co-Pilot-0421/compare/team/sde-8-voicebot...pratiksha-hanji](https://github.com/hanjipratiksha-sudo/AI-Co-Pilot-0421/compare/team/sde-8-voicebot...pratiksha-hanji)
* **Branch:** `pratiksha-hanji` merged into `team/sde-8-voicebot`

### Automated Test Output
```text
Running Team SDE 8 TypeScript Test Suite...

  ✓ PRD Section 19: Redact API keys from context
  ✓ PRD Section 19: Redact Bearer authorization tokens
  ✓ PRD Section 19: Redact passwords
  ✓ Zod Context Schema: Valid payload parses successfully
  ✓ Real Spec Schema: SourceReference validates origin metadata
  ✓ Real Spec Schema: ContextItem validates atomic context item
  ✓ Real Spec Schema: ReasoningRequest parses structured context query
  ✓ Real Spec Schema: ReasoningResult parses engine output with risk level & approval
  ✓ Prompt Loader: Renders v1.0.0 with developer persona
  ✓ Reasoning Service: Developer error is Level A (no approval)
  ✓ Reasoning Service: File move triggers Level C approval gate
  ✓ Reasoning Service: File delete triggers Level D destructive gate
  ✓ Reasoning Service: Current date and time query returns accurate date/time without error diagnosis
  ✓ Reasoning Service: Conversational greeting returns assistant capabilities
  ✓ PRD Section 19: Screen capture is strictly disabled and stays disabled
  ✓ PRD Section 19: Live capture attempt throws error (Synthetic frames only, no real screenshots)
  ✓ Synthetic Frames: Available frames list contains 4 compliant test frames
  ✓ Synthetic Frames: Loading frame generates valid ContextItem with SourceReference
  ✓ Prompt Security: Trusted and untrusted blocks are separated with XML boundaries
  ✓ Prompt Security: Prompt injection tags inside untrusted query are neutralized
  ✓ Reasoning Engine: reason() executes ReasoningRequest and outputs valid ReasoningResult

Test Results: 21/21 passed (100%)
```

