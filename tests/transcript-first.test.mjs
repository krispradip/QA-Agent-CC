/**
 * QA-TEST-TRANSCRIPT-001
 * Run with: node --test tests/transcript-first.test.mjs
 * No Gemini key, customer data or network connection required.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { defaultRubric } from "../public/js/config.js";
import { assess } from "../public/js/engine.js";
import worker from "../src/worker.js";

const moved = [
  "verification", "name", "solution", "callback", "hold", "disconnect"
];

test("27 criteria maintained, six formerly external checks now transcript-assessable", () => {
  const rubric = defaultRubric();
  assert.equal(rubric.criteria.length, 27);
  for (const id of moved) {
    const c = rubric.criteria.find(x => x.id === id);
    assert.ok(c, id);
    assert.equal(c.mode, "ai", id);
    assert.ok(c.checkpoints.length >= 1, id);
  }
  assert.equal(rubric.criteria.find(c => c.id === "systems").mode, "external");
  assert.equal(rubric.criteria.find(c => c.id === "tone").mode, "audio");
  assert.equal(rubric.criteria.filter(c => c.enabled && c.mode === "ai").length, 20);
});

test("new transcript criteria are accepted by the Worker before any Gemini request", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{
      text: JSON.stringify({ findings: [] })
    }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
  try {
    for (const id of moved) {
      const c = defaultRubric().criteria.find(x => x.id === id);
      const request = new Request("https://qualis.test/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gemini-3.5-flash-lite",
          instructions: "Evaluate observable verbal behaviour only",
          criteria: [{
            id: c.id,
            name: c.name,
            definition: c.definition,
            instructions: c.instructions,
            checkpoints: c.checkpoints
          }],
          turns: [{ line: 1, speaker: "agent", text: "Hello, how can I help?" }]
        })
      });
      const response = await worker.fetch(request, { GEMINI_API_KEY: "synthetic-test-key" });
      assert.equal(response.status, 200, "Worker rejected transcript QA parameter: " + id);
    }
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("revised rubric evaluates in <=10-criterion batches and preserves revision", async () => {
  const rubric = defaultRubric();
  const requested = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/evaluate");
    const payload = JSON.parse(options.body);
    assert.ok(payload.criteria.length <= 10);
    requested.push(...payload.criteria.map(c => c.id));
    return new Response(JSON.stringify({
      findings: payload.criteria.map(c => ({
        id: c.id, reason: "Synthetic test evidence",
        anchors: c.checkpoints.map(a => ({
          id: a.id, state: "MET", reason: "Synthetic test evidence",
          evidence: [{ line: 1, quote: "Hello, how can I help?" }]
        }))
      }))
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const call = {
    key: "test-1", id: "test-interaction", status: "READY",
    turns: [{ line: 1, speaker: "agent", timestamp: "00:03",
      seconds: 3, text: "Hello, how can I help?" }]
  };
  try {
    await assess(call, rubric, new AbortController().signal, () => {});
    assert.equal(call.status, "COMPLETE");
    assert.equal(requested.length, 20);
    assert.equal(new Set(requested).size, 20);
    assert.equal(call.meta.rubricRevision, rubric.revision);
    assert.ok(call.meta.criteria.find(c => c.id === "verification" && c.mode === "ai"));
    assert.ok(call.findings.find(c => c.id === "verification" && c.status === "SCORED"));
    assert.ok(call.findings.find(c => c.id === "systems" && c.status === "UNVERIFIABLE"));
  } finally {
    globalThis.fetch = oldFetch;
  }
});
