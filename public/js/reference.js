/**
 * QA-REF-001 | Browser-local, versioned, BU-aware evaluation reference library.
 * References are contextual hints, NEVER evidence or automatic MET decisions.
 * CSV uploads stay in the current browser until a governed backend is available.
 */
export const REFERENCE_SCHEMAS = {
  phonetic: {
    title: "Phonetic & ASR variations",
    description: "Potential speech-to-text renderings of product, brand and service names. Not automatic replacements.",
    columns: ["canonical","variant","language","businessUnit","market","channel","notes"],
    required: ["canonical","variant"],
    example: ["SHARE","Shair","en","SHARE","UAE","Call","Only accept when surrounding dialogue supports the brand"]
  },
  semantic: {
    title: "Semantic equivalents",
    description: "Different natural expressions of the same observable service behaviour.",
    columns: ["concept","phrase","language","businessUnit","market","channel","criterionId","notes"],
    required: ["concept","phrase"],
    example: ["Invite customer to explain","Can I help you?","en","SHARE","UAE","Call","opening","Equivalent invitation, not identity proof"]
  },
  terminology: {
    title: "Business terminology",
    description: "Business-specific vocabulary and meanings; aliases are separated with a vertical bar.",
    columns: ["term","meaning","aliases","language","businessUnit","market","channel","notes"],
    required: ["term","meaning"],
    example: ["SHARE Points","Loyalty reward points","reward points|SHARE balance","en","SHARE","UAE","Call","Context only"]
  },
  guidance: {
    title: "Evaluation guidance & examples",
    description: "Approved positive/negative examples, evidence conditions and assessment scope by checkpoint.",
    columns: ["criterionId","exampleType","example","evaluationRule","scope","language","businessUnit","market","channel","notes"],
    required: ["criterionId","exampleType","example","evaluationRule","scope"],
    example: ["opening-2","negative","Agent provides their name 8 minutes into the call","Introduction must happen within the configured opening scope","opening","en","SHARE","UAE","Call","Requires human-approved rubric alignment"]
  }
};
const KEY="qaai-reference-library-v1";
const MAX_ROWS=600;
const MAX_DATASETS=30;
const MAX_CSV_CHARS=500000;
const MAX_FIELD=600;
const MAX_CONTEXT=40;
const norm=s=>String(s??"").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").trim();

export function csvEscape(s) {
  const t=String(s??"");
  return /[",\r\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t;
}
export function csvTemplate(type) {
  const schema=REFERENCE_SCHEMAS[type];
  if(!schema)throw Error("Unknown reference type");
  return [schema.columns.map(csvEscape).join(","),schema.example.map(csvEscape).join(",")].join("\r\n")+"\r\n";
}
/** RFC4180-style CSV parser incl. multiline quoted cells and escaped quotes. */
function parseCells(raw) {
  const rows=[];let row=[],cell="",inside=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(inside){
      if(c==='"'&&raw[i+1]==='"'){cell+='"';i++;}
      else if(c==='"')inside=false;
      else cell+=c;
    }else if(c==='"'){
      if(cell!=="")throw Error("Unexpected CSV quote at character "+(i+1));
      inside=true;
    }else if(c===","){row.push(cell);cell="";}
    else if(c==="\n"||c==="\r"){
      if(c==="\r"&&raw[i+1]==="\n")i++;
      row.push(cell);cell="";
      if(row.some(v=>v.trim()!==""))rows.push(row);
      row=[];
    }else cell+=c;
  }
  if(inside)throw Error("CSV has an unclosed quoted field");
  row.push(cell);
  if(row.some(v=>v.trim()!==""))rows.push(row);
  return rows;
}
export function parseReferenceCsv(text,type) {
  const schema=REFERENCE_SCHEMAS[type];
  if(!schema)throw Error("Select a valid reference type");
  if(typeof text!=="string"||!text.trim())throw Error("CSV is empty");
  if(text.length>MAX_CSV_CHARS)throw Error("CSV exceeds the 500 KB limit");
  const records=parseCells(text.replace(/^\uFEFF/,""));
  if(records.length<2)throw Error("CSV must contain headers and at least one row");
  if(records.length>MAX_ROWS+1)throw Error("Maximum "+MAX_ROWS+" reference rows per file");
  const headers=records[0].map(s=>s.trim());
  if(new Set(headers).size!==headers.length)throw Error("Duplicate CSV headers");
  for(const col of schema.required)if(!headers.includes(col))throw Error("Missing required column: "+col);
  for(const col of headers)if(!schema.columns.includes(col))throw Error("Unexpected column: "+col);
  const items=[];
  for(const [i,fields] of records.slice(1).entries()){
    if(fields.length!==headers.length)throw Error("CSV row "+(i+2)+" has "+fields.length+" columns; expected "+headers.length);
    const entry=Object.fromEntries(schema.columns.map(col=>[col,""]));
    headers.forEach((col,j)=>{entry[col]=fields[j].trim();});
    if(schema.required.some(k=>!entry[k]))throw Error("CSV row "+(i+2)+" has an empty required value");
    if(Object.values(entry).some(v=>v.length>MAX_FIELD))throw Error("CSV row "+(i+2)+" exceeds the 600-character cell limit");
    if(type==="guidance"){
      if(!["positive","negative","exception","policy"].includes(entry.exampleType.toLowerCase()))throw Error("Row "+(i+2)+": exampleType must be positive, negative, exception, or policy");
      if(!["opening","entire","closing","contextual"].includes(entry.scope.toLowerCase()))throw Error("Row "+(i+2)+": scope must be opening, entire, closing, or contextual");
    }
    items.push(entry);
  }
  return items;
}
export function emptyReferenceLibrary(){return {version:1,revision:1,datasets:[]};}
export function normalizeReferenceLibrary(input) {
  if(!input||!Array.isArray(input.datasets))return emptyReferenceLibrary();
  return {version:1,revision:Math.max(1,Number(input.revision)||1),
    datasets:input.datasets.slice(0,MAX_DATASETS).filter(d=>
      REFERENCE_SCHEMAS[d?.type]&&Array.isArray(d.rows)&&d.rows.length<=MAX_ROWS
    ).map(d=>({id:String(d.id||""),name:String(d.name||"Reference").slice(0,120),
      type:d.type,enabled:d.enabled===true,version:Math.max(1,Number(d.version)||1),
      uploadedAt:String(d.uploadedAt||""),rows:d.rows
    }))};
}
export function loadReferenceLibrary(){
  try{return normalizeReferenceLibrary(JSON.parse(localStorage.getItem(KEY)));}
  catch{return emptyReferenceLibrary();}
}
export function saveReferenceLibrary(library){
  const snapshot=normalizeReferenceLibrary(library);
  localStorage.setItem(KEY,JSON.stringify(snapshot));
  return snapshot;
}
export function importReferenceDataset(library,type,filename,content){
  const rows=parseReferenceCsv(content,type);
  const next=normalizeReferenceLibrary(library);
  if(next.datasets.length>=MAX_DATASETS)throw Error("Reference library limit reached (30 files)");
  const name=String(filename||"reference.csv").replace(/[\\/]/g,"").slice(0,120);
  const versions=next.datasets.filter(d=>d.type===type&&d.name.toLowerCase()===name.toLowerCase());
  // New uploads of the same file keep older versions as inactive history.
  for(const dataset of versions)dataset.enabled=false;
  const version=1+Math.max(0,...versions.map(d=>d.version));
  const record={id:"ref-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10),
    name,type,enabled:true,version,uploadedAt:new Date().toISOString(),rows};
  next.datasets.unshift(record);
  next.revision++;
  return next;
}
export function toggleReferenceDataset(library,id,enabled){
  const next=normalizeReferenceLibrary(library);
  const target=next.datasets.find(x=>x.id===id);
  if(!target)throw Error("Reference file no longer exists");
  target.enabled=Boolean(enabled);
  if(target.enabled)for(const other of next.datasets){
    if(other.id!==id&&other.type===target.type&&other.name.toLowerCase()===target.name.toLowerCase())other.enabled=false;
  }
  next.revision++;
  return next;
}
export function deleteReferenceDataset(library,id){
  const next=normalizeReferenceLibrary(library);
  if(!next.datasets.some(x=>x.id===id))throw Error("Reference file no longer exists");
  next.datasets=next.datasets.filter(d=>d.id!==id);
  next.revision++;
  return next;
}
const applies=(entry,call,criterionIds)=>{
  const matching=(value,observed)=>!value||["all","*","global"].includes(value.toLowerCase())||
    (observed&&norm(value)===norm(observed));
  // BU and market must be explicit for targeted reference records;
  // never guess the BU from transcript or use a cross-BU fallback.
  if(!matching(entry.businessUnit,call.businessUnit||call.bu||""))return false;
  if(!matching(entry.market,call.market||call.country||""))return false;
  if(!matching(entry.channel,call.type||call.channel||""))return false;
  const criterion=entry.criterionId||"";
  return !criterion||["all","*"].includes(criterion.toLowerCase())||
    criterionIds.includes(criterion)||criterionIds.some(id=>criterion.startsWith(id+"-"));
};
/**
 * Select bounded approved hints. Never treat library rows as evidence.
 * Entries with unknown BU/market metadata are excluded unless globally scoped.
 */
export function activeReferenceEntries(library,call,criteria){
  const ids=(criteria||[]).map(c=>typeof c==="string"?c:c.id);
  const dialogue=(call.turns||[]).map(t=>t.text||"").join(" ");
  const haystack=norm(dialogue);
  const relevant=[];
  const seen=new Set();
  for(const dataset of library?.datasets||[]){
    if(dataset.enabled!==true)continue;
    for(const entry of dataset.rows||[]){
      if(!applies(entry,call,ids))continue;
      const candidates=dataset.type==="phonetic"?[entry.canonical,entry.variant]:
        dataset.type==="semantic"?[entry.concept,entry.phrase]:
        dataset.type==="terminology"?[entry.term,...(entry.aliases||"").split("|")]:[];
      // Guidance is already relevant by criterion scope, but other references
      // require an actual match in conversation or configured criteria.
      if(candidates.length&&!candidates.some(s=>s&&haystack.includes(norm(s))))continue;
      const summary=Object.fromEntries(REFERENCE_SCHEMAS[dataset.type].columns.map(c=>[c,entry[c]||""]));
      const key=dataset.type+"|"+JSON.stringify(summary);
      if(seen.has(key))continue;
      seen.add(key);
      relevant.push({type:dataset.type,source:dataset.name,version:dataset.version,...summary});
      if(relevant.length===MAX_CONTEXT)return relevant;
    }
  }
  return relevant;
}
