import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { calculateCriterion } from "../public/js/engine.js";

const checkpoint={id:"opening-3",text:"Invites the customer to explain the reason for contact"};
const criterion={
  id:"opening",name:"Call opening",definition:"Invite the customer to describe their issue",
  instructions:"Equivalent wording counts; use transcript evidence",
  checkpoints:[checkpoint]
};
const turns=[
  {line:1,speaker:"agent",text:"Thank you for calling Cerid, can I help you?",timestamp:"00:05",seconds:5},
  {line:2,speaker:"customer",text:"My SHARE points have expired.",timestamp:"00:10",seconds:10},
  {line:3,speaker:"agent",text:"I can check this with you.",timestamp:"00:20",seconds:20},
  {line:20,speaker:"agent",text:"Would you like help with anything else?",timestamp:"04:10",seconds:250}
];
const primary=(state="MISSED")=>({findings:[{id:"opening",reason:"First evaluator judgement",
  anchors:[{id:checkpoint.id,state,evidenceLines:[1]}]}]});
const review=(decision,finalState,evidenceLines=[1],reason="Independent review of cited dialogue")=>({
  reviews:[{id:checkpoint.id,decision,finalState,evidenceLines,reason}]
});
const response=payload=>({
  ok:true,
  json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]})
});
async function simulate(initial,revised,alternativeTurns=turns) {
  const previous=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    return response(requests.length===1?initial:revised);
  };
  try {
    const req=new Request("https://qaai.example/api/evaluate",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({model:"gemini-3.5-flash-lite",instructions:"SHARE configured assessment guidance",
        criteria:[criterion],turns:alternativeTurns})
    });
    const res=await worker.fetch(req,{GEMINI_API_KEY:"unit-test-only"});
    return {status:res.status,data:await res.json(),requests};
  } finally {globalThis.fetch=previous;}
}

test("Hassan: missed invitation is corrected to MET with independent evidence",async()=>{
  const {status,data,requests}=await simulate(primary(),review("CORRECTED","MET",[1],
    'Agent says "can I help you?" which satisfies the invitation requirement'));
  assert.equal(status,200);
  const anchor=data.findings[0].anchors[0];
  assert.equal(anchor.state,"MET");
  assert.equal(anchor.validation.status,"CORRECTED");
  assert.equal(anchor.validation.originalState,"MISSED");
  assert.equal(anchor.validation.finalState,"MET");
  assert.deepEqual(anchor.validation.evidenceLines,[1]);
  assert.equal(anchor.evidence[0].quote,turns[0].text);
  assert.equal(requests.length,2);
  assert.equal(requests[1].contents[0].parts[0].text.includes("SHARE configured assessment guidance"),true);
  const sent=JSON.parse(requests[1].contents[0].parts[0].text);
  assert.deepEqual(sent.turns.map(t=>t.line),[1,2,3,20]);
  assert.equal(sent.checks[0].criterionInstructions,criterion.instructions);
  const scored=calculateCriterion({...criterion,checkpoints:[{...checkpoint,enabled:true,points:1}]},
    data.findings[0]);
  assert.equal(scored.score,100);
});

test("A confirmed matching MET is preserved with VERIFIED status",async()=>{
  const {data}=await simulate(primary("MET"),review("CONFIRMED","MET"));
  const anchor=data.findings[0].anchors[0];
  assert.equal(anchor.state,"MET");
  assert.equal(anchor.validation.status,"VERIFIED");
});

test("A false MET may be corrected to MISSED when review supports it",async()=>{
  const {data}=await simulate(primary("MET"),review("CORRECTED","MISSED",[1],
    "Completed opening misses required professional identity"));
  const anchor=data.findings[0].anchors[0];
  assert.equal(anchor.state,"MISSED");
  assert.equal(anchor.validation.status,"CORRECTED");
  assert.equal(anchor.validation.originalState,"MET");
});

test("Contradictory structured reviewer response cannot be VERIFIED",async()=>{
  const {data}=await simulate(primary("MISSED"),review("CONFIRMED","MET"));
  const anchor=data.findings[0].anchors[0];
  assert.equal(anchor.state,"UNKNOWN");
  assert.equal(anchor.validation.status,"UNVERIFIED");
});

test("Reviewer correction with fabricated line fails closed",async()=>{
  const {data}=await simulate(primary(),review("CORRECTED","MET",[999]));
  assert.equal(data.findings[0].anchors[0].state,"UNKNOWN");
  assert.equal(data.findings[0].anchors[0].validation.status,"UNVERIFIED");
});

test("Reviewer correction to MET citing customer alone fails closed",async()=>{
  const {data}=await simulate(primary(),review("CORRECTED","MET",[2]));
  assert.equal(data.findings[0].anchors[0].state,"UNKNOWN");
});

test("Inconclusive reviewer never silently retains a speculative MISSED",async()=>{
  const {data}=await simulate(primary(),review("INSUFFICIENT","UNKNOWN",[],
    "Transcript does not prove whether policy was applied"));
  assert.equal(data.findings[0].anchors[0].state,"UNKNOWN");
  assert.equal(data.findings[0].anchors[0].validation.status,"UNVERIFIED");
});

test("Reviewer outage fails closed and preserves original evaluation metadata",async()=>{
  const previous=globalThis.fetch;
  let count=0;
  globalThis.fetch=async()=>{count++;if(count===1)return response(primary());throw Error("network");};
  try{
    const req=new Request("https://qaai.example/api/evaluate",{method:"POST",body:JSON.stringify({
      model:"gemini-3.5-flash-lite",instructions:"Test",criteria:[criterion],turns
    })});
    const res=await worker.fetch(req,{GEMINI_API_KEY:"unit-test-only"});
    const data=await res.json();
    assert.equal(res.status,200);
    assert.equal(data.findings[0].anchors[0].state,"UNKNOWN");
    assert.equal(data.findings[0].anchors[0].validation.originalState,"MISSED");
  } finally {globalThis.fetch=previous;}
});
