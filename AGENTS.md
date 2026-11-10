# Instructions for implementation agents

## Read before changing code

1. Read `docs/AGENT_TASK.md` and `docs/PROGRESS.md`.
2. Read `docs/IMPLEMENTATION_PLAN.md`; select the first unblocked, incomplete task.
3. Read the architecture, UX, runtime, data, API, and acceptance documents referenced by that task.
4. Inspect existing code and repository status before assuming something is missing.

This file applies throughout the repository. Latest explicit owner instructions take precedence.
Product requirements are in AGENT_TASK; fixed engineering choices are in ARCHITECTURE.
For conflicting details between documents, resolve the inconsistency before implementing the affected behavior.

## Working rules

- Build the specified MVP in small, working increments. Do not add features to compensate for missing credentials.
- Follow the dependency order. Complete scaffold task T01 before integration probes.
- A task is complete only when its acceptance criteria have evidence. Code presence alone is insufficient.
- Update PROGRESS after each completed task or meaningful blocker, including exact commands/results and next task.
- If interrupted, record partial work and resume from it. Do not rebuild a completed foundation.
- Keep all documentation, code identifiers, comments, and default UI copy in English.
- Validate provider behavior against official documentation at implementation time. Never invent endpoints or SDK methods.
- Keep fixed stack choices. A proven incompatibility may justify an ADR describing evidence, alternatives, and impact.
- Do not replace Expo with a separate Next.js app, add another auth system, or introduce extra services without an explicit scope decision.
- Use one model-driven agent with tools. Do not build multi-agent orchestration, MCP support, plugins, billing, voice, or code execution for this MVP.
- Use sandbox credentials and synthetic data for tests. Never send a real email or modify a real calendar just to prove a test passes.
- Missing external credentials block only the relevant live check. Implement adapters and automated contract tests; report that live status as blocked.
- Production must fail closed for unavailable services. Test doubles must never silently replace real integrations.
- Never commit secrets, real mail/documents, OAuth state, access tokens, or local machine paths.
- Preserve unrelated changes and local Git identity. Do not change global Git configuration or use work accounts.
- Do not create paid resources, deploy services, change repository visibility, add a license, or submit store builds without owner authorization.
- Commit and push only when requested by the owner or the active task. Repository existence is not permission to deploy.

## Verification and reporting

Run checks appropriate to the change. For code tasks, typecheck, lint, and relevant automated tests
are required; broaden checks for changed integration boundaries. Never report native or live OAuth
checks as passed if only a mock/web test ran. Do not fabricate screenshots, build output, or test results.

Task report format:
- Task ID and implemented behavior.
- Checks executed, result, and environment.
- External configuration still needed.
- Remaining limitations and next task ID.

Use the owner-facing summary for outcomes; keep implementation details in the progress record.
