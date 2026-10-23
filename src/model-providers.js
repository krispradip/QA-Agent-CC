/**
 * QA-LLM-ADAPTER-001 | Provider-independent structured model access.
 * Evaluation policy, rubric semantics, evidence validation and scoring stay
 * outside the provider. Add a new provider here without changing engine.js.
 *
 * Credentials and hostnames are exclusively server-side Cloudflare bindings.
 * The browser may select an approved logical provider/model, not an API URL.
 */
export const GEMINI_MODELS = Object.freeze(["gemini-3.5-flash-lite","gemini-2.5-flash-lite"]);
export const DATABRICKS_MODEL = "databricks-configured";
export const PROVIDERS = Object.freeze(["gemini","databricks"]);

export function selectedProvider(provider) {
  // Preserve compatibility with existing saved rubric configurations / tests.
  return provider === undefined || provider === null ? "gemini" : provider;
}
export function validSelection(provider, model) {
  const p = selectedProvider(provider);
  return p === "gemini" ? GEMINI_MODELS.includes(model) :
    p === "databricks" ? model === DATABRICKS_MODEL : false;
}
export function providerReady(provider, env) {
  const p = selectedProvider(provider);
  if (p === "gemini") return Boolean(env.GEMINI_API_KEY);
  if (p === "databricks") return Boolean(env.DATABRICKS_HOST &&
    env.DATABRICKS_TOKEN && env.DATABRICKS_SERVING_ENDPOINT);
  return false;
}

export class ModelProviderError extends Error {
  constructor(message, status=502, providerError=null) {
    super(message);
    this.name="ModelProviderError";
    this.status=status;
    this.providerError=providerError;
  }
}
export function ensureProviderReady(provider,env) {
  const p=selectedProvider(provider);
  if (providerReady(p,env)) return;
  const names=p==="databricks"
    ? "DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_SERVING_ENDPOINT"
    : "GEMINI_API_KEY";
  throw new ModelProviderError(`${p} backend is not configured. Required Cloudflare binding(s): ${names}.`,503);
}

/** Convert one neutral schema into OpenAI-compatible JSON Schema. */
export function toJsonSchema(value) {
  const type=String(value?.type||"").toLowerCase();
  if (type==="object") {
    const properties=Object.fromEntries(Object.entries(value.properties||{})
      .map(([k,v])=>[k,toJsonSchema(v)]));
    return {type:"object",properties,
      required:Object.keys(properties),
      additionalProperties:false};
  }
  if (type==="array") return {type:"array",items:toJsonSchema(value.items)};
  if (!["string","integer","number","boolean"].includes(type)) {
    throw new ModelProviderError("Unsupported structured-output schema.",500);
  }
  return {...(value.enum?{enum:value.enum}:{}),type};
}

function databricksUrl(env) {
  // A trusted administrator supplies the complete workspace host via the
  // Worker binding, never the browser. Reject unsafe / malformed settings.
  const origin=String(env.DATABRICKS_HOST||"").trim().replace(/\/$/,"");
  const endpoint=String(env.DATABRICKS_SERVING_ENDPOINT||"");
  let base;
  try { base=new URL(origin); } catch { throw new ModelProviderError("Databricks host is not configured correctly.",503); }
  if (base.protocol!=="https:" || base.username || base.password ||
    (base.pathname!=="/" && base.pathname!=="") || base.search || base.hash ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}$/.test(endpoint)) {
    throw new ModelProviderError("Databricks serving endpoint configuration is invalid.",503);
  }
  return `${base.origin}/serving-endpoints/${encodeURIComponent(endpoint)}/invocations`;
}

function providerRequest({provider,model,env,system,user,schema,schemaName,maxOutputTokens}) {
  if(provider==="gemini") return {
    url:`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers:{"content-type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},
    body:{
      systemInstruction:{parts:[{text:system}]},
      contents:[{role:"user",parts:[{text:JSON.stringify(user)}]}],
      generationConfig:{temperature:0,responseMimeType:"application/json",
        responseSchema:schema,maxOutputTokens}
    }
  };
  if(provider==="databricks") return {
    url:databricksUrl(env),
    headers:{"content-type":"application/json",authorization:`Bearer ${env.DATABRICKS_TOKEN}`},
    body:{
      messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(user)}],
      response_format:{type:"json_schema",json_schema:{
        name:schemaName,schema:toJsonSchema(schema),strict:true}},
      max_tokens:maxOutputTokens,
      stream:false
    }
  };
  throw new ModelProviderError("Unsupported model provider.",400);
}

function upstreamCategory(detail,code) {
  if (/schema|response.?mime.?type|response.?format/.test(detail))return "RESPONSE_SCHEMA";
  if (/api.?key|authentication|invalid credential|invalid token/.test(detail))return "API_CREDENTIALS";
  if (/billing|payment|free tier|region|country|paid plan/.test(detail))return "BILLING_OR_REGION";
  if (/model|not supported|not found|endpoint/.test(detail))return "MODEL_ACCESS";
  if (/token|context window|too large|request size|payload size/.test(detail))return "REQUEST_SIZE";
  if (/quota|rate limit|resource exhausted/.test(detail))return "QUOTA_OR_RATE_LIMIT";
  if (/invalid|missing|required|malformed|parameter|field/.test(detail))return "INVALID_REQUEST";
  if(code==="FAILED_PRECONDITION")return "ACCOUNT_PRECONDITION";
  if(code==="RESOURCE_EXHAUSTED")return "QUOTA_OR_RATE_LIMIT";
  return "UNSPECIFIED";
}
async function upstreamError(response,provider) {
  // Never forward upstream free-text errors; they may contain secrets,
  // project references or transcript excerpts.
  let raw={};
  try {
    const body=await response.json();
    raw=body?.error&&typeof body.error==="object"?body.error:{};
  } catch {}
  const status=String(raw.status||raw.code||"");
  const allow=["INVALID_ARGUMENT","FAILED_PRECONDITION","PERMISSION_DENIED",
    "RESOURCE_EXHAUSTED","UNAVAILABLE","NOT_FOUND","INTERNAL",
    "DEADLINE_EXCEEDED","UNAUTHENTICATED"];
  const code=allow.includes(status)?status:"UNCLASSIFIED";
  const category=upstreamCategory(String(raw.message||"").slice(0,3000).toLowerCase(),code);
  const name=provider==="gemini"?"Gemini":"Databricks";
  const message=response.status===429
    ? `${name} quota or rate limit reached (429). Run assessments sequentially.`
    : response.status===400
      ? `${name} rejected the request (400, ${code}, ${category}).`
      : response.status===403
        ? `${name} permission rejected (403, ${code}, ${category}).`
        : `${name} upstream HTTP ${response.status} (${code}, ${category}).`;
  throw new ModelProviderError(message,response.status===429?429:502,{
    httpStatus:response.status,code,category,provider});
}

/** Return validated JSON content; all models share this same contract. */
export async function generateStructured(args) {
  const provider=selectedProvider(args.provider);
  if (!validSelection(provider,args.model)) {
    throw new ModelProviderError("Unsupported provider or model selection.",400);
  }
  ensureProviderReady(provider,args.env);
  const request=providerRequest({...args,provider});
  let response;
  try {
    response=await fetch(request.url,{
      method:"POST",headers:request.headers,
      signal:AbortSignal.timeout(95000),
      body:JSON.stringify(request.body)
    });
  }catch {
    throw new ModelProviderError(`${provider} connection failed or timed out.`,502);
  }
  if(!response.ok)await upstreamError(response,provider);
  let content;
  try {
    const body=await response.json();
    if(provider==="gemini") {
      content=(body.candidates?.[0]?.content?.parts||[])
        .map(p=>p.text||"").join("");
    }else{
      const part=body.choices?.[0]?.message?.content;
      content=typeof part==="string"?part:Array.isArray(part)?
        part.map(p=>p?.text||"").join(""):"";
    }
    const parsed=JSON.parse(content);
    if (!parsed||typeof parsed!=="object"||Array.isArray(parsed))
      throw new Error("Non-object response");
    return parsed;
  }catch {
    const name=provider==="gemini"?"Gemini":"Databricks";
    throw new ModelProviderError(`${name} returned invalid or incomplete structured JSON. Try one smaller call.`,502);
  }
}
