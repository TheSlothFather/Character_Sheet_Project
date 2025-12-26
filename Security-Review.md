# Security and Code Review Plan

Last updated: 2025-12-26

## Purpose
Establish a methodical security and code review process for this repository and track progress from intake through remediation.

## Scope
- Client: `client/` (React 18 + Vite)
- Server: `server/` (Express, legacy)
- Shared logic: `shared/`
- Workers: `functions/` (Cloudflare Durable Objects)
- Data and tooling: `data/`, `tools/`, `tests/`
- Build and config: root `package.json`, `wrangler.jsonc`, `tsconfig.base.json`, `supabase/`

## Status Legend
- NOT_STARTED
- IN_PROGRESS
- DONE
- BLOCKED

## Review Phases

### Phase 0: Preparation
- [ ] Inventory entry points (HTTP routes, worker endpoints, CLI/tools). Status: NOT_STARTED
- [ ] Enumerate external dependencies and versions. Status: NOT_STARTED
- [ ] Identify sensitive data flows and storage locations. Status: NOT_STARTED
- [ ] Confirm env var usage and secrets handling. Status: NOT_STARTED
- [ ] Establish threat model assumptions and trust boundaries. Status: NOT_STARTED

### Phase 1: Automated and Baseline Checks
- [ ] Dependency audit and known CVEs (npm/pnpm/yarn). Status: NOT_STARTED
- [ ] Static analysis baseline (TypeScript strictness, eslint if available). Status: NOT_STARTED
- [ ] Search for hardcoded secrets and tokens. Status: NOT_STARTED
- [ ] Lint for unsafe patterns (eval, child_process, unsafe regex). Status: NOT_STARTED
- [ ] Validate build artifacts are excluded and not tracked. Status: NOT_STARTED

### Phase 2: Manual Security Review
- [ ] Authentication/authorization flows and access control. Status: NOT_STARTED
- [ ] Input validation and sanitization (client/server/worker). Status: NOT_STARTED
- [ ] Injection vectors (SQL, command, template, SSRF). Status: NOT_STARTED
- [ ] XSS/CSRF protections and content security handling. Status: NOT_STARTED
- [ ] Sensitive data exposure in logs, errors, or client state. Status: NOT_STARTED
- [ ] File handling, uploads, and path traversal. Status: NOT_STARTED
- [ ] Session management and token lifecycle. Status: NOT_STARTED
- [ ] Crypto usage (hashing, randomness, key management). Status: NOT_STARTED
- [ ] Rate limiting and abuse protections. Status: NOT_STARTED

### Phase 3: Code Quality and Resilience
- [ ] Error handling and recovery paths. Status: NOT_STARTED
- [ ] Consistent type coverage and boundary checks. Status: NOT_STARTED
- [ ] Shared logic correctness and invariants. Status: NOT_STARTED
- [ ] Performance risks that become security risks (DoS vectors). Status: NOT_STARTED
- [ ] Logging hygiene and observability gaps. Status: NOT_STARTED

### Phase 4: Testing and Verification
- [ ] Identify missing tests for security-sensitive paths. Status: NOT_STARTED
- [ ] Add or update unit tests for validation rules. Status: NOT_STARTED
- [ ] Add integration tests for auth and critical flows. Status: NOT_STARTED
- [ ] Re-run audits after fixes. Status: NOT_STARTED

### Phase 5: Remediation and Sign-off
- [ ] Log issues with severity and references in `Security-Review-Issues.md`. Status: NOT_STARTED
- [ ] Track fixes, retest, and close issues. Status: NOT_STARTED
- [ ] Summarize residual risk and open items. Status: NOT_STARTED

## Component Review Checklist
Use these checklists during manual review and log findings in `Security-Review-Issues.md`.

### Client (`client/`)
- [ ] Dangerous HTML usage (`dangerouslySetInnerHTML`), DOM injection risks
- [ ] Authentication token storage and exposure
- [ ] Input validation for user-entered data
- [ ] Third-party script usage and CSP considerations

### Server (`server/`)
- [ ] Authz checks on each route
- [ ] Validation and schema parsing for inputs
- [ ] File system access controls
- [ ] Safe use of process environment and secrets

### Workers (`functions/`)
- [ ] Durable Object state access controls
- [ ] Request validation and origin constraints
- [ ] Rate limiting or abuse protection

### Shared (`shared/`)
- [ ] Rules engine correctness and boundary checks
- [ ] Shared validators and sanitizers

### Data/Tools (`data/`, `tools/`, `tests/`)
- [ ] CSV/JSON parsing safety and strictness
- [ ] Tooling scripts avoid unsafe command execution

## Progress Log
- 2025-12-26: Plan created and tracking initialized.

