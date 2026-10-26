// Supabase Edge Function: the AI coach.
//
// Deploy:   supabase functions deploy coach
// Secrets:  supabase secrets set GEMINI_API_KEY=...   (or OPENAI_API_KEY / ANTHROPIC_API_KEY)
// Optional: supabase secrets set COACH_MODEL=...
//
// The provider key lives only here, never in the app. Supabase verifies the
// caller's login token before this runs (verify_jwt is on by default).

const SYSTEM_PROMPT = `You are the friendly, personal coach inside Tremor Tracker, an app where people with hand tremor (essential tremor, Parkinson's and others) measure their tremor with their phone and tag sleep, stress, caffeine and medication.

You are given a summary of this user's own profile and readings. Ground every answer in it: cite their actual readings, tags and patterns. Write like a well-made health app: clear, neutral, concise (usually under 120 words), plain English. No greetings, no pep talk, no exclamation marks, no emojis, no filler like "Great question". Use short paragraphs or a few bullet points.

Rules:
- You are not a doctor and the app is not a medical device. Never diagnose.
- Never tell anyone to start, stop or change a medication or dose. You may suggest discussing timing or side effects with their doctor.
- Patterns in their data show what goes together, not proof of cause. Say so when it matters, and mention when there are too few readings to be sure.
- If they describe red flags (sudden onset, one-sided tremor with stiffness or slowness, weakness, numbness, confusion, trouble speaking, falls), advise seeing a doctor promptly, or emergency care for sudden weakness/numbness/speech problems.
- Practical lifestyle ideas are welcome: sleep routine, caffeine and alcohol, meals, stress and breathing, bracing and weighted tools, phone accessibility settings, occupational therapy.
- If asked about something unrelated to their health or the app, gently steer back.`;

type Msg = { role: 'user' | 'assistant'; content: string };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function callOpenAI(key: string, system: string, messages: Msg[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('COACH_MODEL') ?? 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 400,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(key: string, system: string, messages: Msg[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('COACH_MODEL') ?? 'claude-3-5-haiku-latest',
      max_tokens: 400,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
}

class ProviderBusy extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Google retires model names for new keys and sheds load with 503/429, so try a few models with a short backoff. */
async function callGemini(key: string, system: string, messages: Msg[]): Promise<string> {
  const override = Deno.env.get('COACH_MODEL');
  const models = override ? [override] : ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
  });
  let last = '';
  let busy = false;
  // Supabase kills requests after 150 s; stay well inside that
  const deadline = Date.now() + 90_000;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 5_000) throw new ProviderBusy(last || 'out of time');
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(Math.min(25_000, left)),
        });
      } catch (e) {
        last = `Gemini ${model}: ${e instanceof Error ? e.name : 'fetch failed'}`;
        busy = true;
        break;
      }
      if (res.ok) {
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
        if (text.trim()) return text;
        last = `${model}: empty reply`;
        break;
      }
      last = `Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status === 503 || res.status === 429 || res.status >= 500) {
        busy = true;
        await sleep(700 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  throw busy ? new ProviderBusy(last) : new Error(last);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { messages?: Msg[]; context?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'No question' }, 400);

  const context = typeof body.context === 'string' ? body.context.slice(0, 8000) : '';
  const system = `${SYSTEM_PROMPT}\n\n--- This user's data ---\n${context || 'No data yet.'}`;

  const openai = Deno.env.get('OPENAI_API_KEY');
  const anthropic = Deno.env.get('ANTHROPIC_API_KEY');
  const gemini = Deno.env.get('GEMINI_API_KEY');
  try {
    const reply = gemini
      ? await callGemini(gemini, system, messages)
      : openai
        ? await callOpenAI(openai, system, messages)
        : anthropic
          ? await callAnthropic(anthropic, system, messages)
          : null;
    if (reply === null) return json({ error: 'not_configured' }, 503);
    return json({ reply: reply.trim() });
  } catch (e) {
    console.error(e);
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: e instanceof ProviderBusy ? 'provider_busy' : 'provider_failed', detail }, 502);
  }
});
