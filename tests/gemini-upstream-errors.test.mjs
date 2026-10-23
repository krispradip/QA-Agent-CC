import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const baseline={
  model:"gemini-3.5-flash-lite",instructions:"Judge the evidence only",
  criteria:[{id:"opening",name:"Call opening",definition:"",instructions:"",
    checkpoints:[{id:"opening-3",text:"Invite reason for contact"}]}],
  turns:[{line:1,speaker:"agent",text:"How may I help you?",timestamp:"00:05",seconds:5}]
};
async function withUpstream(status,body){
  const before=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status,json:async()=>body});
  try{
    const resp=await worker.fetch(new Request("https://qaai.example/api/evaluate",{
      method:"POST",body:JSON.stringify(baseline)
    }),{GEMINI_API_KEY:"unit-test-secret"});
    return {status:resp.status,result:await resp.json()};
  }finally{globalThis.fetch=before;}
}
test("Gemini 400 response-schema rejection produces useful safe diagnostics",async()=>{
  const {status,result}=await withUpstream(400,{error:{
    status:"INVALID_ARGUMENT",
    message:"Invalid response_schema property for API key ABC-private and test-user@example.com."
  }});
  assert.equal(status,502);
  assert.deepEqual(result.providerError,{httpStatus:400,code:"INVALID_ARGUMENT",category:"RESPONSE_SCHEMA",provider:"gemini"});
  assert.match(result.error,/400, INVALID_ARGUMENT, RESPONSE_SCHEMA/);
  assert.doesNotMatch(JSON.stringify(result),/ABC-private|test-user@example\.com/);
});
test("Gemini 400 account precondition is not misleadingly labelled schema",async()=>{
  const {result}=await withUpstream(400,{error:{
    status:"FAILED_PRECONDITION",
    message:"Free tier not available in your region; enable billing."
  }});
  assert.deepEqual(result.providerError,{httpStatus:400,code:"FAILED_PRECONDITION",category:"BILLING_OR_REGION",provider:"gemini"});
});
test("Gemini 429 retains distinct rate limit response",async()=>{
  const {status,result}=await withUpstream(429,{error:{status:"RESOURCE_EXHAUSTED",message:"Quota exceeded."}});
  assert.equal(status,429);
  assert.deepEqual(result.providerError,{httpStatus:429,code:"RESOURCE_EXHAUSTED",category:"QUOTA_OR_RATE_LIMIT",provider:"gemini"});
});
test("Malformed upstream response cannot erase HTTP error",async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:400,json:async()=>{throw Error("upstream malformed");}});
  try{
    const resp=await worker.fetch(new Request("https://qaai.example/api/evaluate",{method:"POST",body:JSON.stringify(baseline)}),{GEMINI_API_KEY:"test"});
    const result=await resp.json();
    assert.equal(resp.status,502);
    assert.deepEqual(result.providerError,{httpStatus:400,code:"UNCLASSIFIED",category:"UNSPECIFIED",provider:"gemini"});
  }finally{globalThis.fetch=old;}
});
