import test from "node:test";
import assert from "node:assert/strict";
import { executeRule } from "../public/js/engine.js";
import { defaultRubric, loadRubric } from "../public/js/config.js";

const def=(id)=>({id,name:id,source:"genesys"});
const numeric=(id,value,threshold,operator)=>executeRule(
 {turns:[],evidence:{holdEvents:[{durationSeconds:value}],transferEvents:Array.from({length:value},()=>({}))}},
 def(id),{id,value:threshold,operator},{greetingTerms:["hello"]});
test("Configured hold thresholds use <= and custom >= operators",()=>{
 assert.equal(numeric("hold_single",135,120,"<=").state,"MISSED");
 assert.equal(numeric("hold_single",135,130,">=").state,"MET");
 assert.equal(numeric("hold_single",120,120,"<=").state,"MET");
});
test("Configured transfer count uses exact numeric evidence",()=>{
 assert.equal(numeric("transfer_count",2,2,"==").state,"MET");
 assert.equal(numeric("transfer_count",3,2,"<=").state,"MISSED");
});
test("Missing verified metric evidence does not become fabricated MET",()=>{
 const r=executeRule({turns:[],evidence:{}},def("hold_single"),
 {id:"hold_single",value:120,operator:"<="},{});
 assert.equal(r.state,"UNKNOWN");
});
test("Configuration has a valid operator for every catalog rule",()=>{
 const rubric=defaultRubric();
 for(const rule of rubric.rules.deterministic){
  assert.ok([">=",">","<=","<","==","!="].includes(rule.operator),rule.id);
 }
});
test("Configured phrase count is binary with transcript evidence",()=>{
 const r=executeRule({turns:[{speaker:"agent",text:"Thank you for calling",line:1}]},
 def("mandatory_greeting"),{id:"mandatory_greeting",value:1,operator:">="},
 {greetingTerms:["thank you for calling"]});
 assert.equal(r.state,"MET");
});
