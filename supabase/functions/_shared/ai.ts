// Shared AI helper: tries Lovable AI Gateway first; on 429/402 falls back to
// Google Gemini API directly using GEMINI_API_KEY. Supports OpenAI-style
// chat/completions payloads (messages, tools, tool_choice, stream).
//
// Usage:
//   const r = await aiChat({ model, messages, tools, tool_choice });
//   if (!r.ok) return error...
//   const j = await r.json();   // OpenAI-shaped response
//
// For streaming, returns a Response whose body is OpenAI-style SSE.

const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type Msg = { role: "system" | "user" | "assistant"; content: string };
type Tool = { type: "function"; function: { name: string; description?: string; parameters: any } };

interface ChatBody {
  model?: string;
  messages: Msg[];
  tools?: Tool[];
  tool_choice?: any;
  stream?: boolean;
  reasoning?: { effort: string };
}

function mapModelToGemini(model?: string): string {
  if (!model) return "gemini-2.0-flash";
  // accept "google/gemini-…" or already-bare names
  const m = model.replace(/^google\//, "").replace(/-preview$/, "");
  // Map our catalog to public Gemini API model names
  const map: Record<string, string> = {
    "gemini-3-flash": "gemini-2.0-flash",
    "gemini-3-flash-preview": "gemini-2.0-flash",
    "gemini-2.5-pro": "gemini-2.5-pro",
    "gemini-2.5-flash": "gemini-2.5-flash",
    "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
    "gemini-2.0-flash": "gemini-2.0-flash",
  };
  return map[m] || "gemini-2.0-flash";
}

function toGeminiPayload(body: ChatBody) {
  const sys = body.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = body.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const payload: any = { contents };
  if (sys) payload.systemInstruction = { parts: [{ text: sys }] };
  if (body.tools && body.tools.length) {
    payload.tools = [{
      functionDeclarations: body.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description ?? "",
        parameters: sanitizeSchema(t.function.parameters),
      })),
    }];
    if (body.tool_choice && body.tool_choice.type === "function") {
      payload.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: [body.tool_choice.function.name],
        },
      };
    }
  }
  return payload;
}

// Gemini doesn't accept "additionalProperties" or "$schema" or unions.
function sanitizeSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    if (k === "type" && Array.isArray(v)) {
      // Gemini doesn't support union types — pick first non-null
      out.type = (v as string[]).find((x) => x !== "null") || "string";
      out.nullable = (v as string[]).includes("null");
      continue;
    }
    out[k] = sanitizeSchema(v);
  }
  return out;
}

function fromGeminiToOpenAI(g: any) {
  const cand = g?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const fc = parts.find((p: any) => p.functionCall);
  if (fc) {
    return {
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_0",
            type: "function",
            function: {
              name: fc.functionCall.name,
              arguments: JSON.stringify(fc.functionCall.args ?? {}),
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
    };
  }
  const text = parts.map((p: any) => p.text || "").join("");
  return {
    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
  };
}

async function callGemini(body: ChatBody, stream: boolean): Promise<Response> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), { status: 500 });
  }
  const model = mapModelToGemini(body.model);
  const payload = toGeminiPayload(body);
  if (stream) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok || !r.body) return r;
    // Convert Gemini SSE to OpenAI-style chat completion SSE
    const stream = new ReadableStream({
      async start(controller) {
        const reader = r.body!.getReader();
        const decoder = new TextDecoder();
        const enc = new TextEncoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const j = JSON.parse(data);
              const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
              if (text) {
                const chunk = { choices: [{ delta: { content: text } }] };
                controller.enqueue(enc.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              }
            } catch { /* ignore */ }
          }
        }
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) return r;
  const g = await r.json();
  return new Response(JSON.stringify(fromGeminiToOpenAI(g)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function aiChat(body: ChatBody): Promise<Response> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    try {
      const r = await fetch(LOVABLE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status !== 429 && r.status !== 402) return r;
      console.log(`[ai] Lovable returned ${r.status}, falling back to Gemini`);
    } catch (e) {
      console.error("[ai] Lovable fetch failed, falling back:", e);
    }
  }
  return callGemini(body, !!body.stream);
}
