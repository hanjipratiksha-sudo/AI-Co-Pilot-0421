# Data Handling & Privacy Policy (Team SDE 8)

**Module:** Context & Reasoning Engine  
**Project:** Academia AI Voice Co-Pilot  
**Sprint:** Week 4 (Hardening & Release Gate)  
**Location:** `projects/sde-8-voicebot/DATA_HANDLING.md`

---

## 1. Overview & Core Privacy Principles
The **Context & Reasoning Engine** adheres strictly to zero-knowledge and privacy-first principles as mandated by PRD Section 19. All reasoning is conducted offline or in mock mode without transmitting sensitive user context to third-party providers.

* **Opt-In Only:** Capture is strictly disabled by default until explicit user opt-in (`isOptedIn() === false`).
* **Synthetic Frames Only:** Real desktop screenshots and webcam feeds are prohibited. Only deterministic synthetic test frames are permitted.
* **Consent Revocation:** When consent is withdrawn, all in-memory buffers, active observations, and cached hashes are immediately purged.

---

## 2. What Is Captured, Processed, and Retained

| Data Category | What Is Captured | How It Is Processed | Retention Policy | Storage Location |
| :--- | :--- | :--- | :--- | :--- |
| **User Queries** | Spoken transcription or typed input string. | 1. Sanitized for PII (emails, tokens, passwords).<br>2. Analyzed for prompt injection & XML delimiters.<br>3. Enclosed in `<untrusted_user_query>` XML boundaries. | Retained in-memory only for session duration (sliding window: 10 messages). | In-memory RAM only (`Map<string, AggregatedContext>`). Purged on session close or consent revoke. |
| **Screen Vision & OCR** | Synthetic frame metadata: application name, window title, synthetic text lines. | 1. Filtered through PII masking regex.<br>2. Scored for relevance and recency.<br>3. Wrapped in `<untrusted_environment_context>`.<br>4. Commands disarmed into passive text (`[DISARMED_DANGEROUS_COMMAND]`). | Sliding window with **Time-to-Live (TTL) of 300 seconds (5 minutes)**. Evicted when stale. | In-memory RAM buffer (`ObservationStore`). Purged on consent revocation. |
| **PII & Credentials** | API keys (`sk-...`), Bearer tokens, passwords, emails, JWT tokens. | **Masked immediately at ingestion** before reaching prompts, logs, or LLM adapters:<br>• `sk-abcdef...` $\to$ `[REDACTED_API_KEY]`<br>• `Bearer ...` $\to$ `Bearer [REDACTED_TOKEN]`<br>• `user@domain.com` $\to$ `[REDACTED_EMAIL]`<br>• `password="..."` $\to$ `password="[REDACTED]"` | **Never stored in plaintext.** Masked permanently at ingress. | Never written to disk or logs. |
| **Observations & Hashes** | SHA-256 content hashes of (application + window + text). | Used for duplicate frame detection (`DROPPED_DUPLICATE`) and stale dropping (`DROPPED_STALE`). | Ephemeral in-memory set. Purged immediately on consent withdrawal. | In-memory `Set<string>`. |
| **Telemetry & Latency** | Per-stage execution duration (in milliseconds). | Measured via `performance.now()`. Used for performance profiling and CI verification. | Kept during application runtime. No user identity attached. | In-memory `LatencyTracker`. |

---

## 3. Consent Lifecycle & Revocation Protocol

```
                 +-------------------+
                 | Default State     |
                 | Capture: DISABLED |
                 +---------+---------+
                           |
            optIn()        | (Explicit User Action)
                           v
                 +-------------------+
                 | Active State      |
                 | Capture: ENABLED  |
                 | Synthetic Frames  |
                 +---------+---------+
                           |
        withdrawConsent()  | (Revocation Action)
                           v
                 +-------------------+
                 | Revoked State     |
                 | Capture: HALTED   |
                 | In-Memory PURGE   |
                 +-------------------+
```

### Protocol Steps Upon Consent Revocation (`withdrawConsent()`):
1. `isOptedIn()` and `isConsentGranted()` transition immediately to `false`.
2. Any pending frame ingestion calls fail with `DROPPED_CONSENT_WITHDRAWN`.
3. All in-memory observation lists (`observations = []`) and hash registries (`seenContentHashes.clear()`) are wiped.
4. Active prompt loader variables are reset.

---

## 4. Security & Prompt-Injection Safeguards

1. **Trusted vs. Untrusted Data Separation:**
   System instructions are quarantined from user queries and screen context using distinct XML delimiters:
   ```xml
   <trusted_system_instructions>
     You are the Academia Voice Co-Pilot...
   </trusted_system_instructions>
   <untrusted_environment_context>
     <context_item id="obs-01" application="VS Code">
       ...
     </context_item>
   </untrusted_environment_context>
   <untrusted_user_query>
     Why is this application failing?
   </untrusted_user_query>
   ```

2. **Adversarial Screen Text Disarming:**
   Any raw terminal command found inside screen OCR (such as `rm -rf /` or `drop table`) is converted to passive unexecutable text (`[DISARMED_DANGEROUS_COMMAND]`). Instructions found inside screen OCR are **never promoted to executable user intent**.

3. **Safety Gate Invariance:**
   Destructive actions (Level D) or sensitive file mutations (Level C) strictly require explicit human confirmation. Prompt injection attempts claiming *"authorization granted"* are rejected by the safety gate.

---

## 5. Data Disposal & Auditability
* **No Disk Persistence:** The reasoning module does not write user context, audio, or OCR frames to persistent disk storage.
* **No Telemetry Leaks:** Latency measurements contain only millisecond timestamps and stage identifiers; zero personal data or screen content is included in telemetry reports.
* **Deterministic Verification:** 100% of privacy behaviors are verified by automated tests in CI (`run-tests.ts`).
