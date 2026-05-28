/**
 * Vercel Serverless Function — standalone (no Express wrapper).
 * This replaces the previous Express-based approach that was causing 500 errors
 * due to import.meta.url hacks, filesystem access, and bundling issues.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  maxDuration: 60,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskKeyString(k: string) {
  if (k.length <= 12) return "●●●●●●●●";
  return `${k.slice(0, 8)}...${k.slice(-4)}`;
}

function getMaskedKeys(keys: any[]) {
  return keys.map((k) => ({
    id: k.id,
    label: k.label,
    enabled: k.enabled,
    key: maskKeyString(k.key),
  }));
}

// On Vercel there is NO persistent filesystem, so we use an in-memory
// placeholder for the /api/keys endpoints.  Real keys come from
// (a) the GEMINI_API_KEY env-var set in Vercel dashboard, or
// (b) customKeys sent from the client.
let memoryKeyStore: { keys: any[]; autoRotate: boolean } = {
  keys: [],
  autoRotate: true,
};

// ─── System prompt builder (same prompts as server.ts) ──────────────────────

function buildSystemPrompt(quizType: string, isBatch: boolean): string {
  // GK
  if (quizType === "GK") {
    const gkCore = `EXTRACTION RULES - READ CAREFULLY:

1. Extract ALL questions in the input. Each question must be a separate object in the array.
2. BILINGUAL FORMAT: Many questions contain BOTH Bengali and English sections.
   - The Bengali section uses markers: প্রশ্ন: (question), (A)/(B)/(C)/(D) or A./B./C./D. (options), উত্তর: (answer), ব্যাখ্যা: (explanation)
   - The English section uses markers: Question: (question), (A)/(B)/(C)/(D) or A./B./C./D. (options), Answer: (answer), Explanation: (explanation)
   - You MUST extract BOTH sections independently.
   - question_bn = text after প্রশ্ন: (or at start of Bengali block), BEFORE the first option
   - question_en = text after Question: (or "English:"), BEFORE the first English option
   - explanation_bn = text after ব্যাখ্যা: in the Bengali section
   - explanation_en = text after Explanation: in the English section
   - NEVER leave question_en or explanation_en empty when a "Question:" or "Explanation:" marker is present in the input.
   - NEVER leave options_en empty when English options (A./B./C./D. or (A)/(B)/(C)/(D)) appear after the "Question:" marker.

3. OPTIONS: Extract exactly 4 options for each language.
   - Each option is the text AFTER the label (A./B./C./D. or (A)/(B)/(C)/(D)), NOT including the label itself.
   - options_bn: from the Bengali section only
   - options_en: from the English section only
   - If only one language has options, copy them for the other language.

4. CORRECT ANSWER: correctIndex is 0=A, 1=B, 2=C, 3=D.
   - Determine from উত্তর: or Answer: field (whichever is present).
   - Both should agree - if they differ, prefer the one with a clear letter (A/B/C/D).

5. SINGLE LANGUAGE: If only one language is present, copy all fields to both _bn and _en versions.

6. NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits (০১২৩৪৫৬৭৮৯) in the output JSON.`;

    if (isBatch) {
      return `You are a structured data extraction assistant.
Convert the given raw bilingual quiz questions into a valid JSON array of objects.
Output ONLY a raw JSON array. Do NOT wrap in markdown. No extra text.

Required JSON schema:
[
  {
    "id": <number>,
    "question_bn": "Bengali question text (empty string if not present)",
    "options_bn":  ["Option A", "Option B", "Option C", "Option D"],
    "explanation_bn": "Bengali explanation (empty string if not present)",
    "question_en": "English question text (empty string if not present)",
    "options_en":  ["Option A", "Option B", "Option C", "Option D"],
    "explanation_en": "English explanation (empty string if not present)",
    "correctIndex": 0
  }
]

${gkCore}`;
    } else {
      return `You are a structured data extraction assistant.
Convert this single raw bilingual quiz question into a valid JSON object.
Output ONLY a raw JSON object. Do NOT wrap in markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "question_bn": "Bengali question text (empty string if not present)",
  "options_bn":  ["Option A", "Option B", "Option C", "Option D"],
  "explanation_bn": "Bengali explanation (empty string if not present)",
  "question_en": "English question text (empty string if not present)",
  "options_en":  ["Option A", "Option B", "Option C", "Option D"],
  "explanation_en": "English explanation (empty string if not present)",
  "correctIndex": 0
}

${gkCore}`;
    }
  }

  // Passage
  if (quizType === "Passage") {
    if (isBatch) {
      return `You are a structured data extraction assistant.
Convert the given passage and all reading comprehension questions into a single valid JSON object.
Output ONLY a raw JSON object. Do NOT wrap in markdown. No extra text.

Required JSON schema:
{
  "passage": "Full passage text exactly as written - preserve paragraphs and line breaks",
  "questions": [
    {
      "id": <number>,
      "question_en": "Question text only - no leading number, no A/B/C/D options embedded",
      "options_en": [
        "Full text of option A (without 'A.' prefix)",
        "Full text of option B",
        "Full text of option C",
        "Full text of option D"
      ],
      "explanation_en": "Full explanation text",
      "correctIndex": 0
    }
  ]
}

Rules:
- Extract the entire passage text into the "passage" field.
- Extract ALL questions under the passage into the "questions" array.
- correctIndex is an integer: 0=A, 1=B, 2=C, 3=D - derived from "Correct Answer/Option"
- options_en entries must NOT include the letter prefix`;
    } else {
      return `You are a structured data extraction assistant.
Convert this single reading comprehension question into a valid JSON object.
Output ONLY a raw JSON object. Do NOT wrap in markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "question_en": "Question text only - no leading number, no A/B/C/D options embedded",
  "options_en": [
    "Full text of option A (without 'A.' prefix)",
    "Full text of option B",
    "Full text of option C",
    "Full text of option D"
  ],
  "explanation_en": "Full explanation text",
  "correctIndex": 0
}

Rules:
- correctIndex is an integer: 0=A, 1=B, 2=C, 3=D - derived from "Correct Answer/Option"
- options_en entries must NOT include the letter prefix`;
    }
  }

  // Math
  if (quizType === "Math") {
    const mathNotation = `CRITICAL MATHEMATICAL NOTATION RULES - FOLLOW EXACTLY - NO EXCEPTIONS:
STRICTLY FORBIDDEN - never produce these:
  - LaTeX commands: \\\\frac{}{}, \\\\sqrt{}, \\\\alpha, \\\\beta, $...$, $$...$$
  - Using ^ for powers in output text: a^2, x^3    FORBIDDEN
  - Words instead of symbols: sqrt(), alpha, beta, infinity, pi
  - ASCII approximations: >= instead of ≥, <= instead of ≤, != instead of ≠

POWERS AND EXPONENTS - use Unicode superscripts:
  - Available: ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁻ ⁺ ⁿ ⁱ
  - Examples: a² + b² = c², x³, 2⁴, n², M², N², (a+b)²

SQUARE ROOTS AND RADICALS:
  - √ square root: √2, √x, √(a²+b²), 3√5, 2√3
  - ∛ cube root: ∛8, ∛x
  - ∜ fourth root: ∜16

GREEK LETTERS - always use the actual Unicode character:
  - α β γ δ ε θ λ μ π σ φ ω

COMPARISON AND LOGIC OPERATORS:
  - ≤ ≥ ≠ ∞ ≈ ∝ ∴ ∵ → ⟹
  - Arithmetic: × (not *) ÷ ±`;

    if (isBatch) {
      return `You are a bilingual math quiz question formatter for Indian competitive exams.
Convert all raw math question blocks into a valid JSON array of objects.
Output ONLY a raw JSON array. No markdown. No extra text.

Required JSON schema:
[
  {
    "id": <number>,
    "question_bn": "Bengali question with proper Unicode math notation",
    "options_bn":  ["Option A text", "Option B text", "Option C text", "Option D text"],
    "explanation_bn": "Bengali explanation (empty string if not provided)",
    "question_en": "English question with proper Unicode math notation",
    "options_en":  ["Option A text", "Option B text", "Option C text", "Option D text"],
    "explanation_en": "English explanation (empty string if not provided)",
    "correctIndex": 0
  }
]

Rules:
- Extract ALL questions in the input.
- correctIndex: 0=A, 1=B, 2=C, 3=D
- Strip letter prefixes from all option strings
- If only Bengali is present, copy to English fields as well (and vice versa)
- Preserve all numerical values and mathematical relationships exactly

${mathNotation}`;
    } else {
      return `You are a bilingual math quiz question formatter for Indian competitive exams.
Convert one raw math question block into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "question_bn": "Bengali question with proper Unicode math notation",
  "options_bn":  ["Option A text", "Option B text", "Option C text", "Option D text"],
  "explanation_bn": "Bengali explanation (empty string if not provided)",
  "question_en": "English question with proper Unicode math notation",
  "options_en":  ["Option A text", "Option B text", "Option C text", "Option D text"],
  "explanation_en": "English explanation (empty string if not provided)",
  "correctIndex": 0
}

Rules:
- correctIndex: 0=A, 1=B, 2=C, 3=D
- Strip letter prefixes from all option strings
- If only Bengali is present, copy to English fields as well (and vice versa)
- Preserve all numerical values and mathematical relationships exactly

${mathNotation}`;
    }
  }

  // Reasoning
  if (quizType === "Reasoning") {
    const reasoningCore = `Rules:
- correctIndex: 0=A, 1=B, 2=C, 3=D - from "Answer: B" or "উত্তর: B"
- If only Bengali is present, copy to English fields as well (and vice versa)
- Keep line breaks inside tables / codes / series as \\n in the JSON strings
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;

    if (isBatch) {
      return `You are a bilingual reasoning quiz question formatter for Indian competitive exams.
Convert all raw reasoning question blocks into a valid JSON array of objects.
Output ONLY a raw JSON array. No markdown. No extra text. No commentary.

Required JSON schema:
[
  {
    "id": <number>,
    "question_bn": "Bengali question text",
    "options_bn":  ["Option A text", "Option B text", "Option C text", "Option D text"],
    "explanation_bn": "Bengali explanation (empty string if not provided)",
    "question_en": "English question text",
    "options_en":  ["Option A text", "Option B text", "Option C text", "Option D text"],
    "explanation_en": "English explanation (empty string if not provided)",
    "correctIndex": 0
  }
]

- Extract ALL questions in the input.
${reasoningCore}`;
    } else {
      return `You are a bilingual reasoning quiz question formatter for Indian competitive exams.
Convert one raw reasoning question block into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text. No commentary.

Required JSON schema:
{
  "id": <number>,
  "question_bn": "Bengali question text",
  "options_bn":  ["Option A text", "Option B text", "Option C text", "Option D text"],
  "explanation_bn": "Bengali explanation (empty string if not provided)",
  "question_en": "English question text",
  "options_en":  ["Option A text", "Option B text", "Option C text", "Option D text"],
  "explanation_en": "English explanation (empty string if not provided)",
  "correctIndex": 0
}

${reasoningCore}`;
    }
  }

  // Vocabulary
  if (quizType === "Vocabulary") {
    const vocabCore = `Rules:
- correctIndex: 0=A, 1=B, 2=C, 3=D  (from "Correct answer: (X)" or "Answer: X")
- options_en must have exactly 4 entries, NO letter prefixes (A., (A), etc.)
- question_en ends BEFORE the first option label
- If there is an explanation, include it; otherwise use empty string
- NUMBERS: Always write all digits in English (0-9).`;

    if (isBatch) {
      return `You are a data extraction assistant for vocabulary quiz questions.
Convert all given vocabulary quiz questions into a valid JSON array of objects.
Output ONLY a raw JSON array. No markdown. No extra text.

Required JSON schema:
[
  {
    "id": <number>,
    "question_en": "Full question text - must NOT include the options",
    "options_en": ["Option A text only", "Option B text only", "Option C text only", "Option D text only"],
    "explanation_en": "",
    "correctIndex": 0
  }
]

- Extract ALL questions in the input.
${vocabCore}`;
    } else {
      return `You are a data extraction assistant for vocabulary quiz questions.
Convert this single vocabulary quiz question into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "question_en": "Full question text - must NOT include the options",
  "options_en": ["Option A text only", "Option B text only", "Option C text only", "Option D text only"],
  "explanation_en": "",
  "correctIndex": 0
}

${vocabCore}`;
    }
  }

  // Parajumble
  if (quizType === "Parajumble") {
    if (isBatch) {
      return `You are a structured data extraction assistant for Parajumble quiz questions.
Convert all given parajumble questions into a valid JSON array of objects.
Output ONLY a raw JSON array. No markdown. No extra text.

Required JSON schema:
[
  {
    "id": <number>,
    "question_en": "Arrange the sentences in the correct order:",
    "sentences": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "options_en": ["A, B, C, D", "B, D, A, C", "A, C, B, D", "D, B, A, C"],
    "explanation_en": "Full explanation text (empty string if missing)",
    "correctIndex": 1
  }
]

Rules:
- Extract ALL questions.
- question_en: Always "Arrange the sentences in the correct order:"
- sentences: Extract A, B, C, D without their letter prefix
- options_en: Exactly 4 ordering strings.
- correctIndex: 0-based index of matching option.
- NUMBERS: Always write all digits in English (0-9).`;
    } else {
      return `You are a structured data extraction assistant for Parajumble quiz questions.
Convert this single parajumble question into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "question_en": "Arrange the sentences in the correct order:",
  "sentences": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "options_en": ["A, B, C, D", "B, D, A, C", "A, C, B, D", "D, B, A, C"],
  "explanation_en": "Full explanation text (empty string if missing)",
  "correctIndex": 1
}

Rules:
- question_en: Always "Arrange the sentences in the correct order:"
- sentences: Extract A, B, C, D without their letter prefix
- options_en: Exactly 4 ordering strings.
- correctIndex: 0-based index of matching option.
- NUMBERS: Always write all digits in English (0-9).`;
    }
  }

  // Cloze
  if (quizType === "Cloze") {
    if (isBatch) {
      return `You are a structured data extraction assistant for Cloze Test quiz questions.
Convert the given cloze test passage (with blanks) and all numbered questions into a single valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "passage": "Full passage text with blanks represented as (1), (2), etc.",
  "questions": [
    {
      "id": <number>,
      "blank_num": <number>,
      "options_en": ["word A", "word B", "word C", "word D"],
      "correctIndex": 0,
      "explanation_en": "Full explanation text"
    }
  ]
}

Rules:
- Extract the entire passage with blank markers into the "passage" field.
- Extract ALL blank questions into the "questions" array.
- options_en: exactly 4 words/phrases. Remove letter prefixes.
- correctIndex: 0=A, 1=B, 2=C, 3=D
- explanation_en: full text after "Explanation:" - empty string if missing`;
    } else {
      return `You are a structured data extraction assistant for Cloze Test quiz questions.
Convert this single cloze question (one blank) into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "blank_num": <number>,
  "options_en": ["word A", "word B", "word C", "word D"],
  "correctIndex": 0,
  "explanation_en": "Full explanation text"
}

Rules:
- options_en: exactly 4 words/phrases. Remove letter prefixes.
- correctIndex: 0=A, 1=B, 2=C, 3=D
- explanation_en: full text after "Explanation:" - empty string if missing
- NUMBERS: Always write all digits in English (0-9).`;
    }
  }

  // Error Correction
  if (quizType === "Error Correction") {
    const ecCore = `STEP 1: BUILD question_en
The main sentence is divided into labelled parts (A/B/C/D or a/b/c/d).
question_en = FULL sentence keeping ALL part labels and separators exactly.
Strip only the leading serial number from the front.

STEP 2: BUILD options_en (always exactly 4 strings)
options_en[0] = text of part A  (strip label prefix)
options_en[1] = text of part B
options_en[2] = text of part C
options_en[3] = text of part D — almost always "No Error"

STEP 3: FIND correctIndex (0=A, 1=B, 2=C, 3=D)
Map: A/a→0, B/b→1, C/c→2, D/d/E/e→3.

STEP 4: EXTRACT explanation_en
Take everything after: "Explanation:", "Note:", "Rule:", "Reason:".
If absent → use "" (empty string).

NUMBERS: Always write all digits in English (0-9).`;

    if (isBatch) {
      return `You are a structured data extraction assistant for Error Correction / Error Spotting questions.
Convert ALL given raw error correction questions into a valid JSON array of objects.
Output ONLY the raw JSON array. No markdown fences, no extra text.

Required JSON schema:
[
  {
    "id": <number>,
    "question_en": "Full sentence with part labels preserved",
    "options_en": ["Part A text", "Part B text", "Part C text", "No Error"],
    "correctIndex": 1,
    "explanation_en": "Explanation text, or empty string"
  }
]

- Extract ALL questions.
${ecCore}`;
    } else {
      return `You are a structured data extraction assistant for Error Correction / Error Spotting questions.
Convert ONE raw error correction question into this exact JSON object.
Output ONLY the raw JSON. No markdown fences, no extra text.

Required JSON schema:
{
  "id": <number>,
  "question_en": "Full sentence with part labels preserved",
  "options_en": ["Part A text", "Part B text", "Part C text", "No Error"],
  "correctIndex": 1,
  "explanation_en": "Explanation text, or empty string"
}

${ecCore}`;
    }
  }

  return "Convert to JSON.";
}

// ─── Main handler ───────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ── Route: GET /api/health ──────────────────────────────
  const url = req.url || "";
  if (req.method === "GET" && url.includes("/api/health")) {
    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      envKeySet: !!process.env.GEMINI_API_KEY,
    });
  }

  // ── Route: GET /api/keys ────────────────────────────────
  if (req.method === "GET" && url.includes("/api/keys")) {
    return res.status(200).json({
      keys: getMaskedKeys(memoryKeyStore.keys),
      autoRotate: memoryKeyStore.autoRotate,
    });
  }

  // ── Route: POST /api/keys ───────────────────────────────
  if (req.method === "POST" && url.includes("/api/keys") && !url.includes("toggle") && !url.includes("rotate") && !url.includes("parse-quiz")) {
    const { key, label } = req.body || {};
    if (!key || typeof key !== "string" || !key.trim()) {
      return res.status(400).json({ error: "API Key cannot be empty" });
    }
    const trimmedKey = key.trim();
    if (!trimmedKey.startsWith("AIzaSy")) {
      return res.status(400).json({ error: "Key does not look like a standard Google Gemini API key" });
    }
    const duplicate = memoryKeyStore.keys.some((k: any) => k.key === trimmedKey);
    if (duplicate) {
      return res.status(400).json({ error: "This API key is already in the pool" });
    }
    const item = {
      id: "key_" + Date.now(),
      key: trimmedKey,
      label: label?.trim() || `Key Pool #${memoryKeyStore.keys.length + 1}`,
      enabled: true,
    };
    memoryKeyStore.keys.push(item);
    return res.status(200).json({
      keys: getMaskedKeys(memoryKeyStore.keys),
      autoRotate: memoryKeyStore.autoRotate,
      success: "API key added to your secure pool!",
    });
  }

  // ── Route: POST /api/keys/toggle/:id ────────────────────
  if (req.method === "POST" && url.includes("/api/keys/toggle")) {
    const id = url.split("/").pop();
    memoryKeyStore.keys = memoryKeyStore.keys.map((k: any) =>
      k.id === id ? { ...k, enabled: !k.enabled } : k
    );
    return res.status(200).json({
      keys: getMaskedKeys(memoryKeyStore.keys),
      autoRotate: memoryKeyStore.autoRotate,
    });
  }

  // ── Route: POST /api/keys/rotate ────────────────────────
  if (req.method === "POST" && url.includes("/api/keys/rotate")) {
    memoryKeyStore.autoRotate = !memoryKeyStore.autoRotate;
    return res.status(200).json({
      keys: getMaskedKeys(memoryKeyStore.keys),
      autoRotate: memoryKeyStore.autoRotate,
    });
  }

  // ── Route: DELETE /api/keys/:id ─────────────────────────
  if (req.method === "DELETE" && url.includes("/api/keys/")) {
    const id = url.split("/").pop();
    memoryKeyStore.keys = memoryKeyStore.keys.filter((k: any) => k.id !== id);
    return res.status(200).json({
      keys: getMaskedKeys(memoryKeyStore.keys),
      autoRotate: memoryKeyStore.autoRotate,
    });
  }

  // ── Route: POST /api/parse-quiz ─────────────────────────
  if (req.method === "POST" && url.includes("/api/parse-quiz")) {
    try {
      const body = req.body || {};
      const { rawText, quizType, modelName, passageContext, customKeys, isBatch } = body;

      if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
        return res.status(400).json({ error: "rawText is required and must be a non-empty string." });
      }

      // ── Collect candidate API keys ──
      const candidateKeys: string[] = [];

      // 1. Client-sent custom keys (unmasked, valid)
      if (customKeys && Array.isArray(customKeys)) {
        for (const k of customKeys) {
          if (typeof k === "string" && k.trim() && k.startsWith("AIzaSy") && !k.includes("...") && !k.includes("●")) {
            const trimmed = k.trim();
            if (!candidateKeys.includes(trimmed)) candidateKeys.push(trimmed);
          }
        }
      }

      // 2. In-memory server keys
      for (const k of memoryKeyStore.keys) {
        if (k.enabled && typeof k.key === "string" && k.key.startsWith("AIzaSy")) {
          const trimmed = k.key.trim();
          if (!candidateKeys.includes(trimmed)) candidateKeys.push(trimmed);
        }
      }

      // 3. Environment variable
      const envKey = process.env.GEMINI_API_KEY;
      if (envKey && envKey.trim() && envKey.startsWith("AIzaSy") && !candidateKeys.includes(envKey.trim())) {
        candidateKeys.push(envKey.trim());
      }

      if (candidateKeys.length === 0) {
        return res.status(400).json({
          error: "No Gemini API keys are available. Please add at least one custom API key in the panel, or set GEMINI_API_KEY in your Vercel environment variables.",
        });
      }

      // ── Build system prompt ──
      const systemPrompt = buildSystemPrompt(quizType || "GK", isBatch === true);

      // ── Prepare content ──
      let promptContent = rawText;
      if (passageContext && passageContext.trim() !== "") {
        promptContent = `[CONTEXT/PASSAGE FOR REFERENCE]:\n${passageContext}\n\n[QUESTION TO PARSE]:\n${rawText}`;
      }

      // ── Try each key with retries ──
      let lastError: any = null;
      let parsed = null;
      let activeKeyIndex = -1;

      // Dynamic import of @google/genai to avoid top-level import issues
      const { GoogleGenAI } = await import("@google/genai");

      for (let i = 0; i < candidateKeys.length; i++) {
        const apiKey = candidateKeys[i];
        let attemptsCount = 0;
        const maxAttempts = 3;

        while (attemptsCount < maxAttempts && !parsed) {
          attemptsCount++;
          try {
            console.log(`[QUIZ-API] Trying key ${i + 1}/${candidateKeys.length}, attempt ${attemptsCount}...`);
            const ai = new GoogleGenAI({ apiKey });

            const geminiResponse = await ai.models.generateContent({
              model: modelName || "gemini-2.5-flash",
              contents: promptContent,
              config: {
                systemInstruction: systemPrompt,
                temperature: 0,
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
              },
            });

            const reply = (geminiResponse as any)?.text?.trim() || "";
            if (!reply) {
              throw new Error("Gemini returned an empty response. The input may be too large or the model is overloaded.");
            }

            let parsedResult: any;
            try {
              parsedResult = JSON.parse(reply);
            } catch (parseErr) {
              const jsonMatch = reply.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
              if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[1]);
              } else {
                throw new Error(`Failed to parse JSON: ${(parseErr as Error).message}. Raw: ${reply.substring(0, 200)}`);
              }
            }

            parsed = parsedResult;
            activeKeyIndex = i;
            break;
          } catch (err: any) {
            lastError = err;
            console.error(`[QUIZ-API] Error with key ${i + 1}, attempt ${attemptsCount}: ${err.message}`);
            if (err.message && (err.message.includes("429") || err.message.toLowerCase().includes("quota"))) {
              break; // quota error → try next key
            }
            if (attemptsCount < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
        }
        if (parsed) break;
      }

      if (!parsed) {
        const errDetails = lastError ? lastError.message : "Unknown error";
        return res.status(500).json({
          error: `All (${candidateKeys.length}) API keys failed. Last error: ${errDetails}`,
        });
      }

      return res.status(200).json({ data: parsed, keyIndex: activeKeyIndex });
    } catch (err: any) {
      console.error("[QUIZ-API] Unexpected error:", err);
      return res.status(500).json({
        error: `Unexpected server error: ${err.message || "Unknown"}`,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  }

  // ── Fallback: unknown route ─────────────────────────────
  return res.status(404).json({ error: `Route not found: ${req.method} ${url}` });
}
