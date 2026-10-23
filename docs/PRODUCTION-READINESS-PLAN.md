# QA.MAFer.AI — Production Evolution Plan

Status: **Prototype in active development; production implementation requires formal approval.**
Last reviewed: 2026-10-23. Repository: `krispradip/QAAI`.
Development workflow: **feature/evaluation-studio-redesign → review/QA → main**. Treat `main` as the approved *working prototype*, **not** an enterprise production release.

## Non-negotiable design principles

1. **Evolve modules and contracts; do not rewrite the UI or evaluation logic wholesale.** Modularize front-end views, qualitative evaluation, deterministic rules, reference selection, scoring, history, and orchestration behind stable interfaces. Refactor specific modules as integrations arrive.
2. **Configuration drives business logic.** Users edit rubric, checkpoints, points, rules, evaluator guidance, model selections, and (later) checkpoint scope in the application. Generic safety, normalization and scoring code lives separately; no BU-specific conditions inside `engine.js` or `worker.js`.
3. **Separation of concerns.** LLM classifies evidence; independent validator adjudicates; deterministic rules compute observable quantities; scoring formula consumes only final validated checkpoint states. A reference glossary is *context*, not evidence or an auto-pass.
4. **Traceable immutable assessment snapshots.** Every completed evaluation records transcript/source identity, rubric revision, reference-library revision, model/provider, evaluator prompt/config version, evidence line references, original and final decisions, scoring formula version, audit metadata and evaluation time.
5. **Multitenant by BU and market from day one.** Never infer BU solely from transcript; require authoritative source metadata or explicit selection. Checkpoint applicability is by BU/market/channel and independently versioned where needed.
6. **Prototype ≠ enterprise production.** Current browser-local persistence, unrestricted prototype access, no central integrations, and direct model calls via worker are temporary. Do not upload/live-process unapproved identifiable customer data.

## Current components and future replacement points

| Current module | Stable responsibility | Production evolution |
|---|---|---|
| `public/js/ui.js`, `public/js/reference-ui.js` | Presentation only | Keep, add permissions, accessible review workflows |
| `public/js/config.js` | Rubric and rule schema | Swap browser localStorage adapter for versioned configuration API |
| `public/js/reference.js` | CSV validation, versioning and relevance selection | Use centrally governed reference datasets and retrieval API; preserve CSV contracts, row metadata, and preview UI |
| `public/js/engine.js` | Client orchestration and deterministic scoring | Keep deterministic logic testable; move authoritative execution/server snapshots into backend services |
| `src/worker.js` | Gemini evaluation/validation gateway | Add authenticated API, policies, provider adapter, rate control, encrypted secrets, retries and observability |
| `public/js/history.js` | Assessment history in IndexedDB | Replace with assessment repository/API; migrate if required and approved |
| `tests/*.test.mjs` | Regression/contract checks | Extend with reviewed datasets, end-to-end, permissions, contract and load tests |

## Target logical architecture

User (Entra ID / enterprise SSO + RBAC) → QA.MAFer.AI web UI → authenticated API gateway / Worker → Assessment Orchestrator → (transcript and metadata service; rubric registry; rule engine; evaluator + validator; reference retrieval; scoring and review services) → persisted assessment and audit store.

**Source integrations:** Genesys Cloud CX transcript/interaction metadata; optional CRM and QA knowledge sources only after governance approval. Avoid granting the LLM direct backend access to confidential customer profiles. Sanitize/pseudonymize data before AI requests as policy requires.

**Persistence after approval:** relational database for tenants, users/roles, rubric and checkpoint versions, deterministic rule versions, reference datasets/rows/revisions/approvals, interactions, evaluations, evidence, model configs, QA overrides/reviews and audit events. Object storage for approved original transcript/audio where permitted. Schema migration tooling and backup/retention lifecycle required. Choose exact platform/region after enterprise architecture review.

**Key API contracts to preserve:**
- `POST /api/evaluate`: interaction turns with authoritative metadata, rubric revision/model/config, selected approved reference revision → immutable findings with original/final state, evidence, validation decision, score, coverage, provenance.
- `GET/POST /api/rubrics`: drafts, publish/activate, revision and rollback with optimistic concurrency.
- `GET/POST /api/references`: type-specific CSV structure, validate/import, scope, approve/publish, revision, archive/rollback and applicability. Do not auto-activate unapproved uploads in production.
- `GET /api/assessments` and `POST /api/reviews`: role-authorized report and human correction/audit trail.
- `GET /api/health`: liveness/readiness without secrets or customer data.

Actual endpoint names and implementations remain an **architecture proposal**, not deployed features.

## Production backlog — Integration Management (DEFERRED)

Tracked in [GitHub issue #6](https://github.com/krispradip/QAAI/issues/6).
**Do not implement in the current prototype; no Databricks provider integration is approved now.**

Build a secure **Super Admin Integration Management** interface with
configuration-driven instances and stable adapters. Authorized administrators
must be able to add, validate, activate, rotate, replace and disable approved
integrations without changing application source code or committing credentials.

- **LLM providers and model endpoints:** controlled provider selection, model
  settings, endpoint URL, secure credential entry, evaluator/reviewer assignments,
  connection testing, JSON-schema capability testing and safe activation/rollback.
  Databricks is only a possible future approved provider, not a current dependency.
- **Knowledge bases:** governed reference/knowledge sources, retrieval APIs,
  file stores and sync/index jobs, with BU/market scope and citations.
- **Genesys Cloud CX audio and transcripts:** recordings and conversation metadata
  through approved regional org APIs/OAuth and recording permission controls.
- **S3 buckets / object storage:** approved audio, transcript and knowledge objects,
  read/write permissions, region, encryption, prefixes and expiring signed URLs.
- **Other future integrations:** the same extensible, declarative configuration
  contracts and adapter registry; only connectors with implemented/approved
  adapters are selectable. Do not hardcode integrations into QA scorecards/UI.

**Mandatory checks:** admin SSO/RBAC, delegated least-privilege authorization,
vault-backed write-only masked credentials, HTTPS/host allowlisting and SSRF
defences, input schema and connectivity/permission checks, environment isolation,
audit trail, approval/versioning/rollback, encrypted data and token rotation,
health monitoring, retry/circuit-breaking/rate/cost controls, privacy, consent,
residency and retention policy. **Never store credentials in browser localStorage
or return plaintext secrets from an API.**

**Acceptance:** once an integration type is supported, changing its approved
URL, key, model/endpoint, or connection instance must be possible from the UI
with no application code edit/deploy. Existing evaluator, validator, scoring,
rubric, and reporting behaviour must remain stable.

## Accuracy controls required before operational decisions

- Introduce **checkpoint scope** (opening, entire interaction, closing, contextual; optional window/time offsets) as part of versioned rubric configuration, not in a hard-coded prompt. The LLM may view full transcript for context, but MET evidence must satisfy the configured section.
- Implement consistent ASR/phonetic ambiguity handling: canonical terms and sounds-like rows are hints, never literal substitutions or proof of brand mention; insufficient confidence → UNKNOWN/human review.
- Retain original state, corrected final state, explanation, cited transcript lines, model and reference revisions.
- Maintain a **golden benchmark** of human-reviewed multilingual interactions across BUs/channels, with adversarial, ambiguous and missing-context examples. Gate changes on accuracy, false-MET/false-MISSED rate, coverage and repeatability—not only passing unit tests.
- Benchmark score invariants and prevent silent rubric drift when re-running or importing historical interactions.

## Security, operations and governance before live launch

- Entra ID SSO, role-based permissions (agent, evaluator, QA manager, super admin), BU-level authorization and audit.
- Approved hosting region/data residency and legal review for model/transcription retention; minimization and redaction of PII; secrets in managed vault, encryption in transit/at rest, retention/deletion policy.
- Access logs, SIEM integration, model cost/latency metrics, tracing by interaction ID, alerting and abuse/rate limits.
- Resilient retries/timeouts and idempotency for queued batch assessments; dead-letter and manual reprocessing; backup/restore and DR/RTO/RPO targets.
- Change approval and publish workflow for rubrics, rules, references and evaluator prompts; dataset-level owner/approval and rollbacks.
- Security testing (auth/tenancy boundaries, injection-resistant prompting, malicious CSVs, dependency scans), UAT, load testing and runbooks.

## Deployment and release policy

1. All feature development and smoke testing occurs on `feature/evaluation-studio-redesign`; preserve recovery baselines when shipping major releases.
2. Prepare change notes/diff, reconcile `main` changes, run regression CI and approved QA sample tests.
3. Merge via reviewed GitHub PR into `main` (working prototype). Confirm Cloudflare build; synchronize the feature branch to merged `main` before further edits.
4. Never treat a prototype `main` merge as enterprise go-live; production infrastructure/SSO/DB/integration approval is a separate release gate.
5. Feature work must preserve exported assessment JSON/rubric/reference contracts or ship explicit versioned migrations.

## Delivery roadmap after approval

- **Phase 0: Discovery & controls.** Validate BU scope, data classifications, integration permissions, authoritative metadata, and golden QA samples.
- **Phase 1: Enterprise foundation.** SSO/RBAC, central database/API/config/references, secrets and CI/CD environments; migrate adapters without replacing established UI/QA components.
- **Phase 2: Reliable ingestion & evaluation.** Genesys ingest, deduplication, async jobs, scope-aware evaluation/validation, versioned artifacts, QA review.
- **Phase 3: Reporting & operational controls.** Manager QA dashboards, quality calibration, escalation, observability and operational support.
- **Phase 4: Scale out.** Additional BUs, languages, channel-specific rubrics, governance and performance/cost tuning.

### Known prototype limitations, accepted for now

Browser-local rubric, history and reference storage; no team-shared datasets, DB/SSO/Genesys connectivity; incomplete deterministic scope enforcement; no centrally governed approvals. These are **tracked migration responsibilities, not reasons to discard the prototype**.
