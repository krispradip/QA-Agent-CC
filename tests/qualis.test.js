import test from "node:test";
import assert from "node:assert/strict";
import { defaultRubric, GROUPS } from "../public/js/config.js";
import { parseExport, mapSpeakers, SAMPLE } from "../public/js/parser.js";
import { calculateCriterion, overall, localFinding } from "../public/js/engine.js";
import worker from "../src/worker.js";

test("SHARE rubric has 27 criteria and seven categories", () => {
  const r = defaultRubric();
  assert.equal(r.criteria.length, 27);
  assert.equal(GROUPS.length, 7);
  assert.equal(new Set(r.criteria.map(x => x.id)).size, 27);
  const ai = r.criteria.filter(x => x.mode === "ai");
  assert.equal(ai.length, 14);
  for (const c of ai) {
    assert.ok(c.checkpoints.length > 0 && c.checkpoints.length <= 6, c.id);
    assert.ok(c.checkpoints.every((a, i) => a.id === c.id + "-" + (i + 1)), c.id);
  }
});

test("Genesys sample is split into a ready interaction", () => {
  const calls = parseExport(SAMPLE, "sample.txt");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, "READY");
  assert.ok(calls[0].turns.some(t => t.speaker === "agent"));
  assert.ok(calls[0].turns.some(t => t.speaker === "customer"));
});

test("duplicate Genesys interaction IDs are not double assessed", () => {
  const calls = parseExport(SAMPLE + "\n" + SAMPLE, "genesys.txt");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].status, "READY");
  assert.equal(calls[1].status, "DUPLICATE");
});

test("unknown speakers require mapping; never infer the agent", () => {
  const c = parseExport("Speaker 1: Hello\nSpeaker 2: I need help", "chat.txt")[0];
  assert.equal(c.status, "NEEDS_MAPPING");
  mapSpeakers(c, "Speaker 1");
  assert.equal(c.status, "READY");
  assert.deepEqual(c.turns.map(t => t.speaker), ["agent", "customer"]);
});

test("timestamped text and CSV transcripts import correctly", () => {
  const timed = parseExport("00:03 Agent: Hello\n00:06 Customer: Hi", "a.txt");
  assert.equal(timed[0].status, "READY");
  assert.equal(timed[0].turns[0].seconds, 3);
  const csv = "Interaction ID,Speaker,Text,Time\nid1,Agent,Hello,00:02\nid1,Customer,Hi,00:08";
  assert.equal(parseExport(csv, "c.csv")[0].turns.length, 2);
});

test("Qualis scoring is deterministic and UNKNOWN never awards points", () => {
  const r = defaultRubric();
  const criterion = r.criteria.find(c => c.id === "empathy");
  const a = criterion.checkpoints.map(c => ({
    id: c.id,
    state: "MET",
    evidence: [{ line: 1, quote: "I understand" }]
  }));
  const full = calculateCriterion(criterion, { anchors: a, reason: "Observed" });
  assert.equal(full.status, "SCORED");
  assert.equal(full.score, 100);
  a[0].state = "UNKNOWN";
  const incomplete = calculateCriterion(criterion, { anchors: a });
  assert.equal(incomplete.status, "UNVERIFIABLE");
  assert.equal(incomplete.score, null);
  const summary = overall([full], { criteria: [criterion] });
  assert.equal(summary.score, 100);
});

test("deterministic greeting assessment uses the configured threshold", () => {
  const r = defaultRubric();
  const c = parseExport(SAMPLE, "example.txt")[0];
  const greeting = r.criteria.find(c => c.id === "greet7");
  const result = localFinding(c, greeting, r.rules);
  assert.equal(result.score, 100);
  assert.equal(result.status, "SCORED");
});

test("Worker health correctly differentiates absent vs present runtime secret", async () => {
  const req = new Request("https://example.test/api/health");
  const missing = await worker.fetch(req, { ASSETS: { fetch() {} } });
  assert.equal((await missing.json()).apiReady, false);
  const configured = await worker.fetch(req, { GEMINI_API_KEY: "unit-test-not-real" });
  assert.equal((await configured.json()).apiReady, true);
});

test("Worker blocks AI request without runtime secret", async () => {
  const req = new Request("https://example.test/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const response = await worker.fetch(req, {});
  assert.equal(response.status, 503);
});

test("Worker normalizes mocked Gemini evidence without trusting model quotes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(opts.headers["x-goog-api-key"], "fake-key");
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{
        text: JSON.stringify({ findings: [{
          id: "opening",
          reason: "Greeting observed",
          anchors: [{ id: "opening-1", state: "MET", evidenceLines: [1] }]
        }] })
      }] } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const payload = {
      model: "gemini-3.5-flash-lite",
      instructions: "Evidence only",
      criteria: [{
        id: "opening",
        name: "Introduction",
        definition: "Greet professionally",
        instructions: "",
        checkpoints: [{ id: "opening-1", text: "Greets customer" }]
      }],
      turns: [{ line: 1, speaker: "agent", text: "Welcome to SHARE" }]
    };
    const request = new Request("https://example.test/api/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const response = await worker.fetch(request, { GEMINI_API_KEY: "fake-key" });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.findings[0].anchors[0].evidence[0].quote, "Welcome to SHARE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
