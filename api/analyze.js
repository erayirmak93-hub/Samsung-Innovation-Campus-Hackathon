// Vercel serverless function: POST /api/analyze  {story, field, ad, lang}
// Keeps the Anthropic API key on the server so anyone can use the app without a key.
// Set ONE of these in the Vercel project settings:
//   GEMINI_API_KEY    (free key from Google AI Studio; optional GEMINI_MODEL)
//   ANTHROPIC_API_KEY (paid; optional ANTHROPIC_MODEL)
// If both are set, Gemini is used.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const hasKey = () => !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
const LIMITS = { story: 4000, field: 120, ad: 4000 };
const PER_MINUTE = 6;            // per IP, per server instance (light abuse protection)
const hits = new Map();

/* ---- prompt: generated from app/index.html so both stay identical ---- */
const TYPES = ["technical","tool","soft","knowledge","experience"];
function buildPrompt(story, field, ad, lang){
return `You are a career guide for young people with little or no formal work experience. Many of them believe they "have nothing to put on a CV". Your job is to show them, honestly, what they already have, what their target field needs, and the next concrete steps.

Write all explanations in ${lang}. Keep sentences short and simple: the reader may be 17-24 and reading on a phone. Address the reader directly and informally (in Turkish use "sen", never "siz"). Quote fields stay in the original language, copied exactly.

FIRST THINK STEP BY STEP in "reasoning" (3-5 sentences): what has this person actually done, which of those are real skills employers value, what the target field${ad?" and the ad":""} require${ad?"":"s"}, and where the biggest gap is.

RULES — honesty and evidence:
- Every skill in "have" must have "quote": 3-15 words copied VERBATIM from the STORY (do not fix spelling or translate). If you cannot quote it, do not list it. Order "have" from strongest to weakest for the target field.
- Never invent experience, numbers, tools or achievements. CV lines and the STAR story may only use facts from the story. Any number you write must appear in the story.
- ${ad?`Requirements with "source":"ad" must have "ad_quote": 3-15 words copied VERBATIM from the AD. You may add at most 3 extra requirements the field usually needs, with "source":"general" and an empty "ad_quote".`:`There is no ad, so every requirement has "source":"general" and an empty "ad_quote". List 6-9 requirements a junior role in this field typically needs, covering technical skills, tools/software and soft skills.`}
- Requirement "status": "have" or "partial" only with a "story_quote" copied VERBATIM from the story; otherwise "missing".
- Be honest about hard filters (for example a required degree), but always give a realistic route around or through them.
- Next steps must be concrete and free or cheap. Name a type of resource (e.g. "a free online SQL course") rather than a specific website, unless it is a widely known tool.
- Do not make assumptions based on gender, age, origin, disability or family background.
- Requirement "type" is one of: ${TYPES.join(", ")}.

EXAMPLE of one skill (format only):
Story: "...yazın kafede çalıştım, yoğun saatlerde siparişleri ben dağıtıyordum..."
{"skill":"Prioritising under time pressure","type":"soft","quote":"yoğun saatlerde siparişleri ben dağıtıyordum","why":"You decided who got what first when it was busy."}

OUTPUT: only this JSON.
{"reasoning": string, "headline": string (max 25 words, encouraging and specific), "have": [{"skill","type","quote","why"}], "needs": [{"need","type","source","ad_quote","status","story_quote","next"}], "roadmap": [{"when","step","why"}] (exactly 3: next 2 weeks, 1-3 months, 3-6 months), "cv": [{"text","quote"}] (3-5 lines, each with a verbatim story quote), "star": {"situation","task","action","result","quotes":[verbatim story quotes]}, "questions": [2-3 questions that would make the profile stronger]}

TARGET FIELD: ${field||"not given — suggest the 2 most fitting fields in the headline and use the first"}

STORY:
<<<
${story}
>>>
${ad?`\nAD:\n<<<\n${ad}\n>>>`:""}`;
}

function parseJSONLoose(s){
  try{ return JSON.parse(s); }catch{}
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if(f){ try{ return JSON.parse(f[1]); }catch{} }
  const a = s.indexOf("{"), b = s.lastIndexOf("}"); if(a>=0&&b>a){ try{ return JSON.parse(s.slice(a,b+1)); }catch{} }
  return null;
}

export default async function handler(req, res){
  if(req.method === "GET") return res.status(200).json({ ok: hasKey() });
  if(req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if(!hasKey()) return res.status(500).json({ error: "no_model", message: "Set GEMINI_API_KEY or ANTHROPIC_API_KEY" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60000);
  if(list.length >= PER_MINUTE) return res.status(429).json({ error: "rate_limited" });
  list.push(now); hits.set(ip, list);

  const body = typeof req.body === "string" ? (()=>{ try{ return JSON.parse(req.body); }catch{ return {}; } })() : (req.body || {});
  const story = String(body.story || "").trim(), field = String(body.field || "").trim(), ad = String(body.ad || "").trim();
  const lang = body.lang === "Turkish" ? "Turkish" : "English";
  if(story.length < 60) return res.status(400).json({ error: "too_short" });
  if(story.length > LIMITS.story || field.length > LIMITS.field || ad.length > LIMITS.ad) return res.status(400).json({ error: "too_long" });

  try{
    const prompt = buildPrompt(story, field, ad, lang);
    const result = process.env.GEMINI_API_KEY ? await callGeminiSafe(prompt) : await callClaude(prompt);
    if(result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    const out = parseJSONLoose(result.text);
    if(!out) return res.status(502).json({ error: "invalid_json" });
    return res.status(200).json(out);
  }catch(e){
    return res.status(502).json({ error: "upstream_error", message: String(e).slice(0, 200) });
  }
}

// Busy (503/500) → wait and retry once; still busy or out of quota (429) → try the fallback model.
async function callGeminiSafe(prompt){
  const models = [GEMINI_MODEL, GEMINI_FALLBACK].filter((m, i, a) => m && a.indexOf(m) === i);
  let last = { status: 503, error: "busy" };
  for(const model of models){
    for(let attempt = 0; attempt < 2; attempt++){
      const r = await callGemini(prompt, model);
      if(!r.error) return r;
      last = r;
      if(r.error === "busy" && attempt === 0){ await new Promise(ok => setTimeout(ok, 2000)); continue; }
      break;
    }
    if(!["busy", "rate_limited"].includes(last.error)) return last;
  }
  return last;
}

async function callGemini(prompt, model){
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 8000 } })
  });
  if(r.status === 429) return { status: 429, error: "rate_limited" };
  if(r.status === 503 || r.status === 500) return { status: 503, error: "busy" };
  if(!r.ok) return { status: 502, error: "upstream_error", message: (await r.text()).slice(0, 300) };
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if(!text) return { status: 502, error: "upstream_error", message: "empty answer" };
  return { text };
}

async function callClaude(prompt){
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 5000, messages: [{ role: "user", content: prompt }] })
  });
  if(r.status === 429) return { status: 429, error: "rate_limited" };
  if(!r.ok) return { status: 502, error: "upstream_error", message: (await r.text()).slice(0, 300) };
  const j = await r.json();
  return { text: (j.content || []).map(c => c.text || "").join("") };
}
