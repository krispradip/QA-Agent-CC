import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRubric, loadRubric } from "../public/js/config.js";
import { overall, agents } from "../public/js/engine.js";
import { renderDashboardSummary, renderScoreExplanation } from "../public/js/summary.js";
import { applyPeriod } from "../public/js/reporting.js";
import worker from "../src/worker.js";

test("Rubric has editable Gemini instructions and checkpoints", () => {
  const rubric = defaultRubric();
  assert.ok(rubric.criteria.length >= 20);
  assert.ok(rubric.criteria.some(c => c.checkpoints.length > 0));
  assert.ok(rubric.instructions.length > 0);
  assert.ok(rubric.model.startsWith("gemini-"));
});

test("Unverifiable rubric weight does not inflate QA score", () => {
  const rubric = { criteria: [
    { id:"a", enabled:true, weight:5 },
    { id:"b", enabled:true, weight:5 }
  ]};
  const s = overall([
    { id:"a", status:"SCORED", score:80 },
    { id:"b", status:"UNVERIFIABLE", score:null }
  ], rubric);
  assert.equal(s.score,80);
  assert.equal(s.coverage,50);
  assert.equal(s.scored,1);
});

test("Not-applicable rubric weight is excluded from coverage", () => {
  const rubric = { criteria: [
    { id:"a", enabled:true, weight:5 },
    { id:"b", enabled:true, weight:5 }
  ]};
  const s = overall([
    { id:"a", status:"SCORED", score:100 },
    { id:"b", status:"NOT_APPLICABLE", score:null }
  ],rubric);
  assert.equal(s.score,100);
  assert.equal(s.coverage,100);
});

test("Agent and dashboard summary never treat unevaluated calls as scored", () => {
  const calls = [
    { key:"1",agent:"Agent A",status:"COMPLETE",score:{score:93,coverage:56,scored:12,total:27},findings:[] },
    { key:"2",agent:"Agent A",status:"READY",score:null,findings:[] },
    { key:"3",agent:"Agent B",status:"COMPLETE",score:{score:70,coverage:80},findings:[] }
  ];
  const rows=agents(calls);
  assert.equal(rows.find(a=>a.agent==="Agent A").average,93);
  assert.equal(rows.find(a=>a.agent==="Agent A").completed,1);
  const html=renderDashboardSummary(calls,"Agent A");
  assert.match(html,/93%/);
  assert.match(html,/56%/);
  // Other agents remain available in the filter dropdown; only Agent A may appear as a result card.
  assert.doesNotMatch(html,/data-dashboard-agent="Agent B"/);
  assert.match(renderScoreExplanation(calls[0]),/93%/);
});

test("Dashboard escapes transcript-adjacent agent names", () => {
  const html=renderDashboardSummary([{key:"x",agent:"<script>alert(1)</script>",status:"READY",score:null}]);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
});

test("Date filtering does not erase original interaction list", () => {
  const calls=[{start:"2026-10-20T09:00:00Z"},{start:"2026-09-01T09:00:00Z"}];
  const selected=applyPeriod(calls,{mode:"custom",from:"2026-10-01",to:"2026-10-31"});
  assert.equal(selected.calls.length,1);
  assert.equal(calls.length,2);
});

test("Cloudflare health does not disclose Gemini API key", async () => {
  const secret="test-secret-not-real";
  const res=await worker.fetch(new Request("https://qaai.example/api/health"),{
    GEMINI_API_KEY:secret,
    ASSETS:{fetch:async()=>new Response("ok")}
  });
  assert.equal(res.status,200);
  const payload=await res.text();
  assert.match(payload,/"apiReady":true/);
  assert.doesNotMatch(payload,/test-secret-not-real/);
});
