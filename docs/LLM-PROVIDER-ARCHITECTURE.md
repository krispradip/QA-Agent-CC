# QA.MAFer.AI — Provider-independent LLM integration

## Architectural contract
The application **must not depend on one LLM vendor**. Business users manage rubrics,
qualitative checkpoints, quantitative rules and evaluator instructions without editing
JavaScript. The scoring engine (`public/js/engine.js`) and evidence normalization/
independent adjudication (`src/worker.js`) are deliberately provider-neutral.

**Provider adapter:** `src/model-providers.js`.
- `generateStructured` accepts a provider, approved model alias, prompt, neutral
  evidence JSON schema and token budget.
- Google Gemini and Databricks Model Serving each have provider-specific request,
  authentication and JSON-response handling inside that module alone.
- Databricks uses its OpenAI-compatible chat-completions `messages` and
  `response_format: json_schema` API. Schema is recursively converted to JSON Schema.
- Both the first evaluator **and** independent reviewer are routed to the selected
  provider. No silent downgrade/fallback.
- Transcripts and reference hints remain untrusted; scoring remains deterministic.
- Existing saved rubrics lacking a `provider` property use Gemini for compatibility.

## Configuration exposed in QA Configuration
`LLM provider`: **Google Gemini** or **Databricks Model Serving**.
`Active model / endpoint`:
- Gemini 3.5 Flash-Lite
- Gemini 2.5 Flash-Lite
- Databricks approved endpoint (logical alias `databricks-configured`)

Only the selected provider/model executes. Changing this setting **does not** change
rubric criteria, checkpoint enablement, weights or scoring implementation.
Each assessment records `meta.provider`, `meta.model` and rubric revision.

## Cloudflare secrets/bindings (Testing branch)
For Gemini:
- `GEMINI_API_KEY` (secret).

For Databricks:
- `DATABRICKS_HOST`: HTTPS workspace base URL, no path
  (example: `https://adb-0000000000000000.0.azuredatabricks.net`).
- `DATABRICKS_TOKEN`: service principal OAuth token or other approved
  Databricks-compatible bearer credential, stored as a **secret**.
- `DATABRICKS_SERVING_ENDPOINT`: approved endpoint name in that workspace,
  e.g. `qa-llm-production`. Set as environment binding; never as browser input.

The Worker invokes
`POST https://<workspace-host>/serving-endpoints/<endpoint>/invocations`.
The selected token must have **Can Query** permission on that endpoint.

The application deliberately does **not** accept a user-provided arbitrary API host,
bearer token, endpoint URL, or model name. Consequently, switching the Databricks
underlying served model is centrally managed by the approved Databricks endpoint:
**no source code change needed**. Multiple selectable Databricks endpoints are
a future enhancement requiring centrally configured allowlisting/metadata.

`GET /api/health` reports provider readiness with booleans, never secrets.
Selecting Databricks before bindings are configured returns a clear HTTP 503.
Provider credentials are never exposed in UI, exported assessment, or error output.

## Deployment and acceptance criteria
1. Publish only the **testing** branch to the Cloudflare preview.
2. Set the Databricks bindings in the **preview environment**; do not reuse
   production secrets without explicit authorization.
3. Confirm the approved serving endpoint uses a chat-completions-compatible model
   with JSON Schema structured outputs. Not every serving task type or model
   supports this format.
4. In QA Configuration, select Databricks and save. Run **one transcript at a time**.
5. Confirm both evaluation and reviewer succeed; verify evidence lines, score and
   model/provider metadata in exported JSON.
6. Repeat the same interaction multiple times and compare with Gemini against
   human-adjudicated expected outcomes.
7. Review privacy, token expiry/rotation, Databricks model licensing, costs and data
   residency before processing identifiable customer transcripts or using production.
8. **Do not merge into Main** until explicit authorization and live-endpoint validation.

## Testing
`npm test` runs automated regressions, including mocked Gemini and Databricks
providers, schema compatibility, reviewer routing, server-only authentication,
upstream safe errors, and the existing scorecard/selection behaviour.

## Known limits
- Neither Gemini nor Databricks can guarantee identical judgments on repeated
  calls. Configurable checkpoint scope and deterministic timing/evidence checks
  are still needed for consistent QA decisions.
- Provider availability in the user interface does **not** mean Databricks has
  been connected: it requires approved server bindings and a live test.
- Do not treat `VERIFIED` as proof of correct semantic interpretation until
  reviewer-side scope enforcement and human gold-standard regression tests exist.
