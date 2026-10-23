import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {toJsonSchema,validSelection,providerReady} from "../src/model-providers.js";

const baseline={
  provider:"databricks",model:"databricks-configured",
  instructions:"Use only supplied transcript evidence.",
  criteria:[{id:"opening",name:"Call opening",definition:"Greeting",
    instructions:"Equivalent assistance wording is valid",
    checkpoints:[{id:"opening-3",text:"Invites the customer to explain the reason for contact"}]}],
  turns:[
    {line:1,speaker:"agent",text:"Thank you for calling. Can I help you?",timestamp:"00:05",seconds:5},
    {line:2,speaker:"customer",text:"My loyalty points are missing.",timestamp:"00:08",seconds:8}
  ]
};
const env={
  DATABRICKS_HOST:"https://dbc-qa.example.cloud.databricks.com",
  DATABRICKS_TOKEN:"test-server-secret",
  DATABRICKS_SERVING_ENDPOINT:"qa-approved-sonnet"
};
async function dispatch(payload,bindings=env) {
  const response=await worker.fetch(new Request("https://qaai.example/api/evaluate",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify(payload)
  }),bindings);
  return {status:response.status,json:await response.json()};
}
test("Databricks primary evaluator and independent reviewer share a provider",async()=>{
  const previous=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options,body:JSON.parse(options.body)});
    const answer=requests.length===1
      ? {findings:[{id:"opening",reason:"Agent asks a question at opening",
          anchors:[{id:"opening-3",state:"MET",evidenceLines:[1]}]}]}
      : {reviews:[{id:"opening-3",decision:"CONFIRMED",finalState:"MET",
          evidenceLines:[1],reason:"The opening question invites the caller's issue"}]};
    return {ok:true,json:async()=>({
      choices:[{message:{content:JSON.stringify(answer)}}]
    })};
  };
  try {
    const {status,json}=await dispatch(baseline);
    assert.equal(status,200);
    assert.equal(json.provider,"databricks");
    assert.equal(json.model,"databricks-configured");
    assert.equal(json.findings[0].anchors[0].state,"MET");
    assert.equal(json.findings[0].anchors[0].validation.status,"VERIFIED");
    assert.equal(requests.length,2);
    for(const req of requests){
      assert.equal(req.url,"https://dbc-qa.example.cloud.databricks.com/serving-endpoints/qa-approved-sonnet/invocations");
      assert.equal(req.options.headers.authorization,"Bearer test-server-secret");
      assert.equal(req.body.messages[0].role,"system");
      assert.equal(req.body.messages[1].role,"user");
      assert.equal(req.body.response_format.type,"json_schema");
      assert.equal(req.body.response_format.json_schema.strict,true);
      assert.equal(req.body.response_format.json_schema.schema.type,"object");
      assert.equal(req.body.response_format.json_schema.schema.additionalProperties,false);
      assert.equal(req.body.stream,false);
      assert.doesNotMatch(req.body.messages[0].content,/GEMINI_API_KEY/);
    }
  } finally {globalThis.fetch=previous;}
});
test("Databricks requires all server credentials and does not use Gemini fallback",async()=>{
  const result=await dispatch(baseline,{GEMINI_API_KEY:"test-gemini"});
  assert.equal(result.status,503);
  assert.match(result.json.error,/Databricks.*not configured/i);
});
test("Untrusted browser provider/model cannot supply arbitrary endpoint or URL",async()=>{
  for(const data of [
    {...baseline,provider:"not-approved"},
    {...baseline,model:"https://example.com/evil"},
    {...baseline,provider:"gemini",model:"databricks-configured"}
  ]){
    const result=await dispatch(data);
    assert.equal(result.status,400);
    assert.match(result.json.error,/Invalid model|Unsupported/);
  }
});
test("Legacy Gemini requests without provider remain accepted",async()=>{
  assert.equal(validSelection(undefined,"gemini-3.5-flash-lite"),true);
  assert.equal(validSelection("databricks","databricks-configured"),true);
  assert.equal(validSelection("databricks","gemini-3.5-flash-lite"),false);
  assert.equal(providerReady("databricks",env),true);
});
test("Schema converter retains evidence enum and exact JSON object shape",()=>{
  const got=toJsonSchema({type:"OBJECT",properties:{state:{type:"STRING",enum:["MET","MISSED"]},lines:{type:"ARRAY",items:{type:"INTEGER"}}}});
  assert.deepEqual(got,{type:"object",properties:{state:{type:"string",enum:["MET","MISSED"]},lines:{type:"array",items:{type:"integer"}}},required:["state","lines"],additionalProperties:false});
});
test("Databricks upstream error never reveals provider free text or credentials",async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:400,json:async()=>({
    error:{status:"INVALID_ARGUMENT",message:"response_schema invalid secret test-server-secret user@example.com"}
  })});
  try{
    const {status,json}=await dispatch(baseline);
    assert.equal(status,502);
    assert.equal(json.providerError.provider,"databricks");
    assert.equal(json.providerError.category,"RESPONSE_SCHEMA");
    assert.doesNotMatch(JSON.stringify(json),/test-server-secret|user@example.com/);
  }finally{globalThis.fetch=previous;}
});
