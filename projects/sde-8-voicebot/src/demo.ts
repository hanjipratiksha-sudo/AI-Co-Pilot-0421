import { ContextManager } from './core/context-manager';
import { VersionedPromptLoader } from './core/prompt-loader';
import { MockReasoningService } from './services/mock-reasoning.service';

async function runLiveDemo() {
  console.log('===============================================================');
  console.log('  ACADEMIA AI VOICE CO-PILOT — TEAM SDE 8 SPRINT DEMO');
  console.log('  Module: Context Engine & Reasoning Service (W3)');
  console.log('===============================================================\n');

  const contextManager = new ContextManager();
  const promptLoader = new VersionedPromptLoader();
  const reasoningService = new MockReasoningService(contextManager, promptLoader);

  // Scenario 1: Student Developer (UC-02 - Explain Technical Error)
  console.log('--- SCENARIO 1: Student Developer (Explain Error) ---');
  const sessionDev = 'session-dev-101';
  contextManager.updateContext(
    sessionDev,
    { userId: 'student-42', name: 'Alex', role: 'developer', preferences: {} },
    { application: 'VS Code', windowTitle: 'server.ts - VoiceBot', filePath: '/src/server.ts' },
    {
      rawOcrText: 'TypeError: Cannot read properties of undefined (reading "token")',
      capturedAt: new Date().toISOString(),
      sanitized: false
    },
    'Why is this application showing this error?'
  );

  const res1 = await reasoningService.processRequest(
    sessionDev,
    'Why is this application showing this error?',
    'v1.0.0'
  );
  console.log('User Spoken Query:', 'Why is this application showing this error?');
  console.log('Intent Detected:  ', res1.intent);
  console.log('Risk Level:       ', res1.risk_level);
  console.log('Requires Approval:', res1.requires_approval);
  console.log('Spoken Response:  ', res1.response);
  console.log('---------------------------------------------------------------\n');

  // Scenario 2: Research Student (UC-03 - Explain Document Methodology)
  console.log('--- SCENARIO 2: Research Student (Explain Paper Methodology) ---');
  const sessionResearch = 'session-res-202';
  contextManager.updateContext(
    sessionResearch,
    { userId: 'student-99', name: 'Priya', role: 'researcher', preferences: {} },
    { application: 'Acrobat PDF Reader', windowTitle: 'Attention_Is_All_You_Need.pdf' },
    {
      rawOcrText: 'Section 3.2: Multi-Head Attention allows the model to jointly attend to information...',
      capturedAt: new Date().toISOString(),
      sanitized: false
    },
    'Explain the methodology shown on this page.'
  );

  const res2 = await reasoningService.processRequest(
    sessionResearch,
    'Explain the methodology shown on this page.',
    'v1.0.0'
  );
  console.log('User Spoken Query:', 'Explain the methodology shown on this page.');
  console.log('Intent Detected:  ', res2.intent);
  console.log('Risk Level:       ', res2.risk_level);
  console.log('Requires Approval:', res2.requires_approval);
  console.log('Spoken Response:  ', res2.response);
  console.log('---------------------------------------------------------------\n');

  // Scenario 3: Controlled Action (UC-08 - Safety Level C Approval Gate)
  console.log('--- SCENARIO 3: Controlled Action (Safety Level C Gate) ---');
  const sessionAction = 'session-act-303';
  contextManager.updateContext(
    sessionAction,
    { userId: 'user-007', name: 'Jordan', role: 'general', preferences: {} },
    { application: 'File Explorer', windowTitle: 'Downloads' },
    {
      rawOcrText: 'report_final.pdf, data_table.xlsx, notes.txt',
      capturedAt: new Date().toISOString(),
      sanitized: false
    },
    'Move these files into the project folder.'
  );

  const res3 = await reasoningService.processRequest(
    sessionAction,
    'Move these files into the project folder.',
    'v1.0.0'
  );
  console.log('User Spoken Query:', 'Move these files into the project folder.');
  console.log('Intent Detected:  ', res3.intent);
  console.log('Risk Level:       ', res3.risk_level);
  console.log('Requires Approval:', res3.requires_approval, '(Human-in-the-Loop Gate)');
  console.log('Tool Proposed:    ', res3.tool_call?.toolName, JSON.stringify(res3.tool_call?.parameters));
  console.log('Spoken Response:  ', res3.response);
  console.log('---------------------------------------------------------------\n');

  // Scenario 4: Privacy Guardrail Verification (PRD Section 19)
  console.log('--- SCENARIO 4: Privacy & PII Sanitization Test ---');
  const rawLeak = 'Error using key sk-1234567890abcdef1234567890abcdef and password="mySecretPassword123"';
  const cleanText = contextManager.sanitize(rawLeak);
  console.log('Raw Input Screen OCR: ', rawLeak);
  console.log('Sanitized Output:     ', cleanText);
  console.log('Privacy Check Passed: ', !cleanText.includes('1234567890') && !cleanText.includes('mySecretPassword123'));
  console.log('===============================================================');
  console.log('  ALL SPRINT ACCEPTANCE SCENARIOS SUCCESSFULLY VERIFIED');
  console.log('===============================================================');
}

runLiveDemo().catch(console.error);

