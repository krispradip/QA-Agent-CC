import test from "node:test";
import assert from "node:assert/strict";
import { REFERENCE_SCHEMAS, parseReferenceCsv, csvTemplate, emptyReferenceLibrary,
  importReferenceDataset, toggleReferenceDataset, deleteReferenceDataset, activeReferenceEntries,
  loadReferenceLibrary, saveReferenceLibrary } from "../public/js/reference.js";
import { configShell, referenceLibraryView } from "../public/js/reference-ui.js";
import worker from "../src/worker.js";
import { assess } from "../public/js/engine.js";
import {defaultRubric, setCriterionEnabled} from "../public/js/config.js";

test("Config contains QA Configurator and Reference Library under one master tab",()=>{
  const library=emptyReferenceLibrary();
  const html=configShell("references",referenceLibraryView(library));
  assert.match(html,/data-config-tab="rubric"/);
  assert.match(html,/data-config-tab="references"/);
  assert.match(html,/aria-selected="true"/);
  assert.match(html,/Phonetic &amp; ASR variations/);
  assert.match(html,/Semantic equivalents/);
  assert.match(html,/Business terminology/);
  assert.match(html,/Evaluation guidance &amp; examples/);
  assert.match(html,/data-ref-upload="phonetic"/);
  assert.match(html,/data-ref-template="guidance"/);
});

test("Each reference category has a downloadable parseable sample template",()=>{
  for(const type of Object.keys(REFERENCE_SCHEMAS)){
    const data=parseReferenceCsv(csvTemplate(type),type);
    assert.equal(data.length,1,type);
    assert.deepEqual(Object.keys(data[0]),REFERENCE_SCHEMAS[type].columns);
  }
});

test("CSV parser supports quoted commas, escaped quotes and line breaks",()=>{
  const content=['concept,phrase,notes','Greeting,"Hello, how may I help?","Example with ""quote"" and\nmultiple lines"'].join("\n");
  const [item]=parseReferenceCsv(content,"semantic");
  assert.equal(item.phrase,"Hello, how may I help?");
  assert.equal(item.notes,'Example with "quote" and\nmultiple lines');
});

test("Malformed headers, absent values and excessive cells are rejected",()=>{
  assert.throws(()=>parseReferenceCsv("canonical,variant\nSHARE,","phonetic"),/empty required/);
  assert.throws(()=>parseReferenceCsv("canonical,canonical,variant\na,b,c","phonetic"),/Duplicate/);
  assert.throws(()=>parseReferenceCsv("canonical,variant,secret\na,b,c","phonetic"),/Unexpected/);
  assert.throws(()=>parseReferenceCsv('canonical,variant\na,"unclosed','phonetic'),/unclosed/);
  assert.throws(()=>parseReferenceCsv("canonical,variant\nSHARE,Shair,extra","phonetic"),/columns/);
});

test("Guidance requires a valid scope and example classification",()=>{
  const template=csvTemplate("guidance");
  assert.equal(parseReferenceCsv(template,"guidance")[0].scope,"opening");
  assert.throws(()=>parseReferenceCsv(template.replace(",opening,",",midcall,"),"guidance"),/scope/);
  assert.throws(()=>parseReferenceCsv(template.replace(",negative,",",unsupported,"),"guidance"),/exampleType/);
});

test("Uploading same filename makes a new active version; rollback and delete work",()=>{
  let library=emptyReferenceLibrary();
  library=importReferenceDataset(library,"phonetic","terms.csv",csvTemplate("phonetic"));
  const id1=library.datasets[0].id;
  library=importReferenceDataset(library,"phonetic","terms.csv",csvTemplate("phonetic"));
  const id2=library.datasets[0].id;
  assert.deepEqual(library.datasets.map(d=>[d.version,d.enabled]),[[2,true],[1,false]]);
  library=toggleReferenceDataset(library,id1,true);
  assert.equal(library.datasets.find(d=>d.id===id1).enabled,true);
  assert.equal(library.datasets.find(d=>d.id===id2).enabled,false);
  library=deleteReferenceDataset(library,id2);
  assert.equal(library.datasets.length,1);
});

test("Saved reference state persists and reloads without changing rubric",()=>{
  const old=globalThis.localStorage;
  const db=new Map();
  globalThis.localStorage={getItem:key=>db.get(key)||null,setItem:(key,val)=>db.set(key,val)};
  try{
    const library=importReferenceDataset(emptyReferenceLibrary(),"semantic","meaning.csv",csvTemplate("semantic"));
    saveReferenceLibrary(library);
    assert.equal(loadReferenceLibrary().datasets[0].type,"semantic");
    assert.equal(loadReferenceLibrary().revision,2);
  }finally{globalThis.localStorage=old;}
});

test("Only approved relevant entries are sent; no cross-BU leakage on unknown metadata",()=>{
  let library=importReferenceDataset(emptyReferenceLibrary(),"phonetic","brands.csv",
    "canonical,variant,businessUnit,market,channel\nSHARE,Cerid,SHARE,UAE,Call\nSHARE,Shair,All,All,All\n");
  const call={type:"Call",turns:[{text:"Thank you for calling Cerid, can I help you?"}]};
  const refs=activeReferenceEntries(library,call,[{id:"opening"}]);
  assert.deepEqual(refs,[]);
  // When supplied as explicit and authorized interaction metadata, the scoped row qualifies.
  call.businessUnit="SHARE";call.market="UAE";
  assert.equal(activeReferenceEntries(library,call,[{id:"opening"}]).length,1);
  // Global variant qualifies only if its own term appears in the transcript.
  call.turns=[{text:"Welcome to Shair"}];
  assert.equal(activeReferenceEntries(library,call,[{id:"opening"}]).length,1);
});

test("Reference preview HTML escapes uploaded CSV content",()=>{
  const library=importReferenceDataset(emptyReferenceLibrary(),"phonetic","unsafe.csv",
    'canonical,variant\nSHARE,"<script>alert(1)</script>"');
  const html=referenceLibraryView(library);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
});

test("Selected reference hints reach Gemini evaluator AND validator",async()=>{
  const reqs=[];
  const old=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>{
    const body=JSON.parse(opts.body);
    reqs.push(body);
    const payload=reqs.length===1
      ? {findings:[{id:"opening",reason:"test",anchors:[{id:"opening-1",state:"MET",evidenceLines:[1]}]}]}
      : {reviews:[{id:"opening-1",decision:"CONFIRMED",finalState:"MET",evidenceLines:[1],reason:"Brand established"}]};
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]})};
  };
  try{
    const reference={type:"phonetic",source:"approved.csv",version:1,canonical:"SHARE",variant:"Shair"};
    const response=await worker.fetch(new Request("https://qaai.example/api/evaluate",{
      method:"POST",body:JSON.stringify({
        model:"gemini-3.5-flash-lite",instructions:"Test",references:[reference],
        criteria:[{id:"opening",name:"Opening",definition:"",instructions:"",checkpoints:[{id:"opening-1",text:"Brand"}]}],
        turns:[{line:1,speaker:"agent",text:"Welcome to Shair",timestamp:"00:04"}]
      })
    }),{GEMINI_API_KEY:"test"});
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.findings[0].anchors[0].state,"MET");
    for(const body of reqs){
      const part=JSON.parse(body.contents[0].parts[0].text);
      assert.deepEqual(part.referenceHints,[reference]);
    }
  }finally{globalThis.fetch=old;}
});

test("Assessment records selected reference provenance without changing quantitative rules",async()=>{
  const rubric=defaultRubric();
  for(const criterion of rubric.criteria)setCriterionEnabled(rubric,criterion.id,false);
  setCriterionEnabled(rubric,"greet7",true);
  const call={id:"test",status:"READY",turns:[{line:1,speaker:"agent",
    text:"Hello, thanks for calling",timestamp:"00:05",seconds:5}]};
  await assess(call,rubric,new AbortController().signal,()=>{},{
    revision:3,entries:[{type:"phonetic",source:"approved.csv",version:1}]
  });
  assert.equal(call.meta.referenceRevision,3);
  assert.deepEqual(call.meta.referenceSources,["approved.csv"]);
  assert.equal(call.meta.referenceEntriesUsed,1);
  assert.equal(call.findings[0].anchors[0].state,"MET");
});
