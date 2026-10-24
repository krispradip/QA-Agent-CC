import test from "node:test";
import assert from "node:assert/strict";
import { defaultRubric } from "../public/js/config.js";
import { configuration, studio, overview } from "../public/js/ui.js";

test("QA Configurator has a collapsed state and no editor after closing a parameter", () => {
  const rubric = defaultRubric();
  const id = rubric.criteria[0].id;
  const expanded = configuration(rubric, id);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /id="cName"/);
  const collapsed = configuration(rubric, null);
  assert.doesNotMatch(collapsed, /aria-expanded="true"/);
  assert.doesNotMatch(collapsed, /id="cName"/);
  assert.match(collapsed, /aria-expanded="false"/);
});

test("Stop-after-current provides a visible locked state and keeps progress", () => {
  const rubric = defaultRubric();
  const call = { key: "check:1", id: "check:1", agent: "Sample Agent", status: "READY",
    turns: [], findings: [], score: null, duration: "00:15" };
  const html = studio({
    calls: [call], selected: call.key, running: true, stopAfterCurrent: true,
    phase: "ai", message: "Stop requested — finishing current interaction",
    search: "", agentFilter: "", rubric
  });
  assert.match(html, /Stop requested/);
  assert.match(html, /No more interactions will start/);
  assert.match(html, /id="stopAfter"[^>]*disabled/);
});

test("Paused batch explicitly offers to resume pending interactions", () => {
  const rubric = defaultRubric();
  const call = { key: "check:2", id: "check:2", agent: "Sample Agent", status: "READY",
    turns: [], findings: [], score: null, duration: "00:15" };
  const html = studio({
    calls: [call], selected: call.key, running: false, stopAfterCurrent: false,
    phase: "idle", message: "Stopped — completed results retained",
    search: "", agentFilter: "", rubric
  });
  assert.match(html, /Resume pending/);
  assert.match(html, /Stopped · 1 pending/);
});

test("Evaluation Studio keeps assessment actions within each conversation and removes workflow panel", () => {
  const rubric=defaultRubric();
  const calls=[
    {key:"interaction:complete",id:"interaction-complete",agent:"Hassan Aly1",
      status:"COMPLETE",duration:"15:03",findings:[{id:"opening",status:"SCORED",score:75}],
      score:{score:75,coverage:100}},
    {key:"interaction:pending",id:"interaction-pending",agent:"Mohamed El Ekwary",
      status:"READY",duration:"04:16",findings:[],score:null}
  ];
  const html=studio({
    calls,selected:calls[0].key,running:false,stopAfterCurrent:false,
    phase:"idle",message:"",search:"",agentFilter:"",rubric
  });
  assert.doesNotMatch(html,/ASSESSMENT WORKFLOW|studio-results|id="call-detail"/);
  const queue=html.match(/<div class="studio-queue-row">([\s\S]*?)<div class="studio-hint-row">/)?.[1]||"";
  assert.ok(queue,"Conversations panel must exist");
  assert.match(queue,/0 duplicates\s*· 0 errors/);
  assert.match(queue,/<button[^>]+data-page-go="agents"[^>]*>Open Agents &amp; Reports/);
  assert.match(queue,/data-open="interaction:complete"/);
  assert.match(queue,/data-open="interaction:pending"/);
  const completeButton=queue.match(/<button[^>]+data-open="interaction:complete"[^>]*>/)?.[0]||"";
  const pendingButton=queue.match(/<button[^>]+data-open="interaction:pending"[^>]*>/)?.[0]||"";
  assert.doesNotMatch(completeButton,/disabled/);
  assert.match(pendingButton,/disabled/);
  assert.equal((html.match(/data-page-go="agents"/g)||[]).length,1);
});

test("Successful import does not reserve an intake feedback row or reproduce duplicate-count banner", () => {
  const rubric=defaultRubric();
  const html=studio({
    calls:[{key:"imported:1",id:"sample-1",agent:"Sample Agent",status:"READY",
      duration:"01:00",findings:[],score:null}],
    selected:"imported:1",running:false,stopAfterCurrent:false,phase:"idle",
    message:"",importFeedback:"",search:"",agentFilter:"",rubric
  });
  assert.doesNotMatch(html,/Select Evaluate to start assessment/);
  assert.doesNotMatch(html,/1 new · 0 existing/);
  assert.match(html,/id="import-feedback"[^>]*><\/p>/);
  assert.match(html,/id="ai-stage" class="qmf-stage"><\/p>/);
  assert.match(html,/Conversations/);
});


test("Approved Studio places two evaluation cards left, circular evaluator center, and split transcript intake right", () => {
  const rubric=defaultRubric();
  const call={key:"interaction:qa",id:"qa",agent:"Example Agent",status:"COMPLETE",
    duration:"01:45",findings:[{id:"greet7",status:"SCORED",score:100}],score:{score:100,coverage:100}};
  const html=studio({
    calls:[call],selected:call.key,running:false,stopAfterCurrent:false,
    phase:"idle",message:"",search:"",agentFilter:"",rubric
  });
  const dashboard=html.slice(html.indexOf('class="studio-v5-dashboard"'),html.indexOf('<!-- studio-v5-dashboard -->'));
  assert.match(dashboard,/class="studio-evaluator-side"/);
  assert.match(dashboard,/class="studio-eval-details panel"/);
  assert.match(dashboard,/class="panel studio-v5-progress"/);
  assert.match(dashboard,/class="studio-evaluator-main"/);
  assert.match(dashboard,/class="studio-intake-column"/);
  assert.match(dashboard,/class="studio-intake-grid"/);
  const intake=dashboard.slice(dashboard.indexOf('class="studio-intake-grid"'));
  const pasteAt=intake.indexOf('class="intake-tile intake-paste"');
  const stackAt=intake.indexOf('class="studio-v5-upload-stack"');
  const fileAt=intake.indexOf('class="intake-tile intake-file"');
  const audioAt=intake.indexOf('class="intake-tile intake-audio"');
  assert.ok(pasteAt>=0&&pasteAt<stackAt&&stackAt<fileAt&&fileAt<audioAt);
  assert.match(intake,/id="paste"[^>]*maxlength="50000"/);
  assert.match(intake,/id="paste-count"/);
  assert.match(intake,/id="file"[^>]*accept="\.txt,\.tsv,\.csv,\.json,\.srt,\.vtt,\.md,\.log"/);
  assert.match(intake,/Not yet enabled in this prototype/);
});

test("Approved Studio keeps all eight action controls in the requested single-line group order", () => {
  const rubric=defaultRubric();
  const call={key:"interaction:qa",id:"qa",agent:"Example Agent",status:"COMPLETE",
    findings:[{id:"greet7",status:"SCORED",score:100}],score:{score:100,coverage:100}};
  const html=studio({
    calls:[call],selected:call.key,running:false,stopAfterCurrent:false,
    phase:"idle",message:"",search:"",agentFilter:"",rubric
  });
  const toolbar=html.slice(html.indexOf('class="studio-v5-toolbar"'),html.indexOf('class="studio-queue-row"'));
  const ids=[...toolbar.matchAll(/<button[^>]*id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,["all","stop","stopAfter","one","clearBatch","demo","json","csv"]);
  assert.match(toolbar,/EVALUATION[\s\S]*BATCH ACTIONS[\s\S]*EXPORT/);
  assert.match(toolbar,/Remove all batch/);
  assert.match(toolbar,/Export JSON/);
  assert.doesNotMatch(toolbar,/Threads to Q|rerunAll/);
  assert.ok(html.indexOf('studio-v5-dashboard')<html.indexOf('studio-v5-toolbar'));
  assert.ok(html.indexOf('studio-v5-toolbar')<html.indexOf('studio-queue-row'));
});

test("Conversations header retains filters, reports and assessment inspection in dedicated action column",()=>{
  const rubric=defaultRubric();
  const call={key:"interaction:qa",id:"qa",agent:"Example Agent",status:"COMPLETE",
    findings:[{id:"greet7",status:"SCORED",score:100}],score:{score:100,coverage:100}};
  const html=studio({
    calls:[call],selected:call.key,running:false,stopAfterCurrent:false,
    phase:"idle",message:"",search:"",agentFilter:"",rubric
  });
  const queue=html.slice(html.indexOf('class="studio-queue-row"'),html.indexOf('class="studio-hint-row"'));
  assert.match(queue,/id="search"/);
  assert.match(queue,/id="filter"/);
  assert.match(queue,/data-page-go="agents"/);
  assert.match(queue,/<th>ACTIONS<\/th>/);
  assert.match(queue,/class="studio-v5-inspect-cell"/);
  assert.match(queue,/data-open="interaction:qa"/);
});

test("Studio layout CSS locks a true circle and preserves a one-row scrollable toolbar on narrow screens",async()=>{
  const fs=await import("node:fs");
  const css=fs.readFileSync(new URL("../public/css/app.css",import.meta.url),"utf8");
  assert.match(css,/\.studio-v5 \.qmf-core-shell\{[^}]*aspect-ratio:1\/1/);
  assert.match(css,/\.studio-v5 \.qmf-core\{[^}]*aspect-ratio:1\/1/);
  assert.match(css,/\.studio-v5 \.studio-v5-dashboard\{[^}]*grid-template-columns:/);
  assert.match(css,/\.studio-v5 \.studio-v5-upload-stack\{[^}]*grid-template-rows:repeat\(2/);
  assert.match(css,/\.studio-v5 \.studio-v5-toolbar\{[^}]*flex-wrap:nowrap/);
  assert.match(css,/\.studio-v5 \.studio-v5-toolbar\{[^}]*overflow-x:auto/);
});

test("Home hero retains approved copy without the decorative Q logo", () => {
  const html=overview([], defaultRubric());
  const hero=html.slice(html.indexOf('<section class="hero">'),html.indexOf('</section>'));
  assert.match(hero,/QA\.MAFer\.AI \/ QUALITY INTELLIGENCE/);
  assert.match(hero,/Every conversation\./);
  assert.match(hero,/A clearer quality picture\./);
  assert.match(hero,/Assess complete Genesys exports, trace every/);
  assert.match(hero,/improve with defensible evidence\./);
  assert.doesNotMatch(hero,/hero-logo|<span>Q<\/span>|EVIDENCE → QUALITY/);
});
