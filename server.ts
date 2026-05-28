import express from "express";
import path from "path";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { fileURLToPath } from "url";

// Safe __dirname resolution for both ES Modules (local) and CommonJS (Vercel) without syntax-level parser issues
const getDirname = () => {
  try {
    const metaUrl = new Function("return import.meta.url")();
    return path.dirname(fileURLToPath(metaUrl));
  } catch {
    return typeof (globalThis as any).__dirname !== "undefined" ? (globalThis as any).__dirname : process.cwd();
  }
};
const _dirname = getDirname();

export function createExpressApp() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // API key helper functions and secure storage path
  const KEYS_FILE = path.join(process.cwd(), "quiz_keys.json");

  function readKeysFile() {
    try {
      if (!fs.existsSync(KEYS_FILE)) {
        return { keys: [], autoRotate: true };
      }
      const data = fs.readFileSync(KEYS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Failed to read keys file", err);
      return { keys: [], autoRotate: true };
    }
  }

  function writeKeysFile(data: any) {
    try {
      fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write keys file", err);
    }
  }

  function maskKeyString(k: string) {
    if (k.length <= 12) return "●●●●●●●●";
    return `${k.slice(0, 8)}...${k.slice(-4)}`;
  }

  function getMaskedKeys(keys: any[]) {
    return keys.map(k => ({
      id: k.id,
      label: k.label,
      enabled: k.enabled,
      key: maskKeyString(k.key)
    }));
  }

  // API endpoints for managing key pool securely on the server
  app.get("/api/keys", (req, res) => {
    const config = readKeysFile();
    res.json({
      keys: getMaskedKeys(config.keys),
      autoRotate: config.autoRotate
    });
  });

  app.post("/api/keys", (req, res) => {
    const { key, label } = req.body;
    if (!key || typeof key !== "string" || !key.trim()) {
      return res.status(400).json({ error: "API Key cannot be empty" });
    }
    const trimmedKey = key.trim();
    if (!trimmedKey.startsWith("AIzaSy")) {
      return res.status(400).json({ error: "Key does not look like a standard Google Gemini API key (should start with AIzaSy)" });
    }

    const config = readKeysFile();
    const duplicate = config.keys.some((k: any) => k.key === trimmedKey);
    if (duplicate) {
      return res.status(400).json({ error: "This API key is already in the pool" });
    }

    const item = {
      id: "key_" + Date.now(),
      key: trimmedKey,
      label: label?.trim() || `Key Pool #${config.keys.length + 1}`,
      enabled: true
    };

    config.keys.push(item);
    writeKeysFile(config);

    res.json({
      keys: getMaskedKeys(config.keys),
      autoRotate: config.autoRotate,
      success: "API key added to your secure pool!"
    });
  });

  app.delete("/api/keys/:id", (req, res) => {
    const { id } = req.params;
    const config = readKeysFile();
    config.keys = config.keys.filter((k: any) => k.id !== id);
    writeKeysFile(config);
    res.json({
      keys: getMaskedKeys(config.keys),
      autoRotate: config.autoRotate
    });
  });

  app.post("/api/keys/toggle/:id", (req, res) => {
    const { id } = req.params;
    const config = readKeysFile();
    config.keys = config.keys.map((k: any) => {
      if (k.id === id) {
        return { ...k, enabled: !k.enabled };
      }
      return k;
    });
    writeKeysFile(config);
    res.json({
      keys: getMaskedKeys(config.keys),
      autoRotate: config.autoRotate
    });
  });

  app.post("/api/keys/rotate", (req, res) => {
    const config = readKeysFile();
    config.autoRotate = !config.autoRotate;
    writeKeysFile(config);
    res.json({
      keys: getMaskedKeys(config.keys),
      autoRotate: config.autoRotate
    });
  });

  // API endpoints
  app.post("/api/parse-quiz", async (req, res) => {
    try {
      const { rawText, quizType, modelName, passageContext, customKeys } = req.body;
      
      // Load enabled keys from server-side pool
      const config = readKeysFile();
      const candidateKeys: string[] = [];
      
      if (config.keys && Array.isArray(config.keys)) {
        config.keys.forEach((k: any) => {
          if (k.enabled && typeof k.key === "string" && k.key.trim() && k.key.startsWith("AIzaSy")) {
            candidateKeys.push(k.key.trim());
          }
        });
      }

      // Add client-side custom keys if provided (ensuring they are valid unmasked keys)
      if (customKeys && Array.isArray(customKeys)) {
        customKeys.forEach((k: any) => {
          if (typeof k === "string" && k.trim() && k.startsWith("AIzaSy") && !k.includes("...") && !k.includes("●")) {
            const trimmed = k.trim();
            if (!candidateKeys.includes(trimmed)) {
              candidateKeys.push(trimmed);
            }
          }
        });
      }
      
      // Fallback to server environment key if available and not already in client list
      const envKey = process.env.GEMINI_API_KEY;
      if (envKey && envKey.trim() && envKey.startsWith("AIzaSy") && !candidateKeys.includes(envKey.trim())) {
        candidateKeys.push(envKey.trim());
      }

      if (candidateKeys.length === 0) {
        return res.status(400).json({ 
          error: "No Gemini API keys are available. Please add at least one custom API key in the panel." 
        });
      }

      let systemPrompt = "";
      const isBatch = req.body.isBatch === true;

      if (quizType === "GK") {
        if (isBatch) {
          systemPrompt = `You are a structured data extraction assistant.
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

EXTRACTION RULES - READ CAREFULLY:

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
        } else {
          systemPrompt = `You are a structured data extraction assistant.
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

EXTRACTION RULES - READ CAREFULLY:

1. BILINGUAL FORMAT: Many questions contain BOTH Bengali and English sections.
   - The Bengali section uses markers: প্রশ্ন: (question), (A)/(B)/(C)/(D) or A./B./C./D. (options), উত্তর: (answer), ব্যাখ্যা: (explanation)
   - The English section uses markers: Question: (question), (A)/(B)/(C)/(D) or A./B./C./D. (options), Answer: (answer), Explanation: (explanation)
   - You MUST extract BOTH sections independently.
   - question_bn = text after প্রশ্ন: (or at start of Bengali block), BEFORE the first option
   - question_en = text after Question: (or "English:"), BEFORE the first English option
   - explanation_bn = text after ব্যাখ্যা: in the Bengali section
   - explanation_en = text after Explanation: in the English section
   - NEVER leave question_en or explanation_en empty when a "Question:" or "Explanation:" marker is present in the input.
   - NEVER leave options_en empty when English options (A./B./C./D. or (A)/(B)/(C)/(D)) appear after the "Question:" marker.

2. OPTIONS: Extract exactly 4 options for each language.
   - Each option is the text AFTER the label (A./B./C./D. or (A)/(B)/(C)/(D)), NOT including the label itself.
   - options_bn: from the Bengali section only
   - options_en: from the English section only
   - If only one language has options, copy them for the other language.

3. CORRECT ANSWER: correctIndex is 0=A, 1=B, 2=C, 3=D.
   - Determine from উত্তর: or Answer: field (whichever is present).
   - Both should agree - if they differ, prefer the one with a clear letter (A/B/C/D).

4. SINGLE LANGUAGE: If only one language is present, copy all fields to both _bn and _en versions.

5. NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits (০১২৩৪৫৬৭৮৯) in the output JSON.`;
        }
      } else if (quizType === "Passage") {
        if (isBatch) {
          systemPrompt = `You are a structured data extraction assistant.
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
          systemPrompt = `You are a structured data extraction assistant.
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
      } else if (quizType === "Math") {
        if (isBatch) {
          systemPrompt = `You are a bilingual math quiz question formatter for Indian competitive exams.
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
- Extract ALL questions in the input. Each question must be a separate object in the array.
- correctIndex: 0=A, 1=B, 2=C, 3=D - from "Answer: (B)" or "উত্তর: (B)"
- Strip letter prefixes (A., B., etc.) from all option strings
- If only Bengali is present, copy to English fields as well (and vice versa)
- Preserve all numerical values and mathematical relationships exactly

CRITICAL MATHEMATICAL NOTATION RULES - FOLLOW EXACTLY - NO EXCEPTIONS:
STRICTLY FORBIDDEN - never produce these:
  - LaTeX commands: \\frac{}{}, \\sqrt{}, \\alpha, \\beta, $...$, $$...$$
  - Using ^ for powers in output text: a^2, x^3    FORBIDDEN
  - Words instead of symbols: sqrt(), alpha, beta, infinity, pi
  - ASCII approximations: >= instead of ≥, <= instead of ≤, != instead of ≠

POWERS AND EXPONENTS - use Unicode superscripts:
  - Available: ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁻ ⁺ ⁿ ⁱ
  - Examples: a² + b² = c², x³, 2⁴, n², M², N², (a+b)²
  - For complex variable exponents: use parentheses  x^(2n+1), 2^(n-1)

SQUARE ROOTS AND RADICALS:
  - √ square root: √2, √x, √(a²+b²), 3√5, 2√3
  - ∛ cube root: ∛8, ∛x
  - ∜ fourth root: ∜16
  - Never use: sqrt(), root(), or any text form

GREEK LETTERS - always use the actual Unicode character:
  - α β γ δ ε θ λ μ π σ φ ω

COMPARISON AND LOGIC OPERATORS:
  - ≤ ≥ ≠ ∞ ≈ ∝ ∴ ∵ → ⟹
  - Arithmetic: × (not *) ÷ ±`;
        } else {
          systemPrompt = `You are a bilingual math quiz question formatter for Indian competitive exams.
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
- correctIndex: 0=A, 1=B, 2=C, 3=D - from "Answer: (B)" or "উত্তর: (B)"
- Strip letter prefixes (A., B., etc.) from all option strings
- If only Bengali is present, copy to English fields as well (and vice versa)
- Preserve all numerical values and mathematical relationships exactly

CRITICAL MATHEMATICAL NOTATION RULES - FOLLOW EXACTLY - NO EXCEPTIONS:
STRICTLY FORBIDDEN - never produce these:
  - LaTeX commands: \\frac{}{}, \\sqrt{}, \\alpha, \\beta, $...$, $$...$$
  - Using ^ for powers in output text: a^2, x^3    FORBIDDEN
  - Words instead of symbols: sqrt(), alpha, beta, infinity, pi
  - ASCII approximations: >= instead of ≥, <= instead of ≤, != instead of ≠

POWERS AND EXPONENTS - use Unicode superscripts:
  - Available: ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁻ ⁺ ⁿ ⁱ
  - Examples: a² + b² = c², x³, 2⁴, n², M², N², (a+b)²
  - For complex variable exponents: use parentheses  x^(2n+1), 2^(n-1)

SQUARE ROOTS AND RADICALS:
  - √ square root: √2, √x, √(a²+b²), 3√5, 2√3
  - ∛ cube root: ∛8, ∛x
  - ∜ fourth root: ∜16
  - Never use: sqrt(), root(), or any text form

GREEK LETTERS - always use the actual Unicode character:
  - α β γ δ ε θ λ μ π σ φ ω

COMPARISON AND LOGIC OPERATORS:
  - ≤ ≥ ≠ ∞ ≈ ∝ ∴ ∵ → ⟹
  - Arithmetic: × (not *) ÷ ±`;
        }
      } else if (quizType === "Reasoning") {
        if (isBatch) {
          systemPrompt = `You are a bilingual reasoning quiz question formatter for Indian competitive exams.
Convert all raw reasoning question blocks into a valid JSON array of objects.
Output ONLY a raw JSON array. No markdown. No extra text. No commentary.

Required JSON schema:
[
  {
    "id": <number>,
    "question_bn": "Bengali question text (keep blank lines / line breaks with \\n if the puzzle has a table / sitting arrangement / pattern)",
    "options_bn":  ["Option A text", "Option B text", "Option C text", "Option D text"],
    "explanation_bn": "Bengali explanation (empty string if not provided)",
    "question_en": "English question text (keep blank lines / line breaks with \\n if the puzzle has a table / sitting arrangement / pattern)",
    "options_en":  ["Option A text", "Option B text", "Option C text", "Option D text"],
    "explanation_en": "English explanation (empty string if not provided)",
    "correctIndex": 0
  }
]

Rules:
- Extract ALL questions in the input. Each question must be a separate object in the array.
- correctIndex: 0=A, 1=B, 2=C, 3=D - from "Answer: B" or "উত্তর: B"
- If only Bengali is present, copy to English fields as well (and vice versa)
- Keep line breaks inside tables / codes / series as \\n in the JSON strings
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        } else {
          systemPrompt = `You are a bilingual reasoning quiz question formatter for Indian competitive exams (SSC, Bank, Railway, WBCS, PSC).
Convert one raw reasoning question block into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text. No commentary.

Required JSON schema:
{
  "id": <number>,
  "question_bn": "Bengali question text (keep blank lines / line breaks with \\n if the puzzle has a table / sitting arrangement / pattern)",
  "options_bn":  ["Option A text", "Option B text", "Option C text", "Option D text"],
  "explanation_bn": "Bengali explanation (empty string if not provided)",
  "question_en": "English question text (keep blank lines / line breaks with \\n if the puzzle has a table / sitting arrangement / pattern)",
  "options_en":  ["Option A text", "Option B text", "Option C text", "Option D text"],
  "explanation_en": "English explanation (empty string if not provided)",
  "correctIndex": 0
}

Rules:
- correctIndex: 0=A, 1=B, 2=C, 3=D - from "Answer: B" or "উত্তর: B"
- If only Bengali is present, copy to English fields as well (and vice versa)
- Keep line breaks inside tables / codes / series as \\n in the JSON strings
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        }
      } else if (quizType === "Vocabulary") {
        if (isBatch) {
          systemPrompt = `You are a data extraction assistant for vocabulary quiz questions.
Convert all given vocabulary quiz questions into a valid JSON array of objects.
Output ONLY a raw JSON array. No markdown. No extra text.

Required JSON schema:
[
  {
    "id": <number>,
    "question_en": "Full question text - must NOT include the options (stop before '(A)' or 'A.')",
    "options_en": [
      "Option A text only (no letter prefix)",
      "Option B text only",
      "Option C text only",
      "Option D text only"
    ],
    "explanation_en": "",
    "correctIndex": 0
  }
]

Rules:
- Extract ALL questions in the input. Each question must be a separate object in the array.
- correctIndex: 0=A, 1=B, 2=C, 3=D  (from "Correct answer: (X)" or "Answer: X")
- options_en must have exactly 4 entries, NO letter prefixes (A., (A), etc.)
- question_en ends BEFORE the first option label
- If there is an explanation, include it; otherwise use empty string
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        } else {
          systemPrompt = `You are a data extraction assistant for vocabulary quiz questions.
Convert this single vocabulary quiz question into a valid JSON object.
The question may have options INLINE like "(A) text (B) text (C) text (D) text" or on separate lines.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "question_en": "Full question text - must NOT include the options (stop before '(A)' or 'A.')",
  "options_en": [
    "Option A text only (no letter prefix)",
    "Option B text only",
    "Option C text only",
    "Option D text only"
  ],
  "explanation_en": "",
  "correctIndex": 0
}

Rules:
- correctIndex: 0=A, 1=B, 2=C, 3=D  (from "Correct answer: (X)" or "Answer: X")
- options_en must have exactly 4 entries, NO letter prefixes (A., (A), etc.)
- question_en ends BEFORE the first option label
- If there is an explanation, include it; otherwise use empty string
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        }
      } else if (quizType === "Parajumble") {
        if (isBatch) {
          systemPrompt = `You are a structured data extraction assistant for Parajumble quiz questions.
Convert all given parajumble questions into a valid JSON array of objects.
Output ONLY a raw JSON array. No markdown. No extra text.

Required JSON schema:
[
  {
    "id": <number>,
    "question_en": "Arrange the sentences in the correct order:",
    "sentences": {
      "A": "Full text of sentence A (no letter prefix like 'A.' or 'A)')",
      "B": "Full text of sentence B",
      "C": "Full text of sentence C",
      "D": "Full text of sentence D"
    },
    "options_en": [
      "A, B, C, D",
      "B, D, A, C",
      "A, C, B, D",
      "D, B, A, C"
    ],
    "explanation_en": "Full explanation text (empty string if missing)",
    "correctIndex": 1
  }
]

Rules:
- Extract ALL questions in the input. Each question must be a separate object in the array.
- question_en: Always "Arrange the sentences in the correct order:" (heading only, no sentences)
- sentences: Extract A, B, C, D without their letter prefix
- options_en: Exactly 4 ordering strings.
- correctIndex: 0-based index of matching option.
- explanation_en: Extract the Explanation text. Empty string if not present.
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        } else {
          systemPrompt = `You are a structured data extraction assistant for Parajumble quiz questions.
Convert this single parajumble question into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "question_en": "Arrange the sentences in the correct order:",
  "sentences": {
    "A": "Full text of sentence A (no letter prefix like 'A.' or 'A)')",
    "B": "Full text of sentence B",
    "C": "Full text of sentence C",
    "D": "Full text of sentence D"
  },
  "options_en": [
    "A, B, C, D",
    "B, D, A, C",
    "A, C, B, D",
    "D, B, A, C"
  ],
  "explanation_en": "Full explanation text (empty string if missing)",
  "correctIndex": 1
}

Rules:
- question_en: Always "Arrange the sentences in the correct order:" (heading only, no sentences)
- sentences: Extract A, B, C, D without their letter prefix
- options_en: Exactly 4 ordering strings. Format of options line:
    "Options (choose one): A, B, C, D B, D, A, C A, C, B, D D, B, A, C"
    The 4 orderings (each "X, Y, Z, W") may be on one line separated by spaces, or on separate lines.
    Use regex pattern [A-D], [A-D], [A-D], [A-D] to extract each ordering.
- correctIndex: 0-based index of matching option. Example: if correct option is "B, D, A, C"
    and options_en[1] == "B, D, A, C", then correctIndex = 1
    Match by removing all spaces and comparing: "B,D,A,C" == "B,D,A,C"
- explanation_en: Extract the Explanation text. Empty string if not present.
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        }
      } else if (quizType === "Cloze") {
        if (isBatch) {
          systemPrompt = `You are a structured data extraction assistant for Cloze Test quiz questions.
Convert the given cloze test passage (with blanks) and all numbered questions into a single valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "passage": "Full passage text with blanks represented as (1), (2), etc. exactly as written",
  "questions": [
    {
      "id": <number>,
      "blank_num": <number>,
      "options_en": [
        "word for option A (no letter prefix)",
        "word for option B",
        "word for option C",
        "word for option D"
      ],
      "correctIndex": 0,
      "explanation_en": "Full explanation text"
    }
  ]
}

Rules:
- Extract the entire passage with blank markers into the "passage" field.
- Extract ALL blank questions into the "questions" array.
- options_en: exactly 4 words/phrases. Remove letter prefixes like "A)", "A.", "(A)" etc.
- correctIndex: 0=A, 1=B, 2=C, 3=D - from "Correct Answer: B" -> correctIndex = 1
- explanation_en: full text after "Explanation:" - empty string if missing`;
        } else {
          systemPrompt = `You are a structured data extraction assistant for Cloze Test quiz questions.
Convert this single cloze question (one blank) into a valid JSON object.
Output ONLY a raw JSON object. No markdown. No extra text.

Required JSON schema:
{
  "id": <number>,
  "blank_num": <number>,
  "options_en": [
    "word for option A (no letter prefix)",
    "word for option B",
    "word for option C",
    "word for option D"
  ],
  "correctIndex": 0,
  "explanation_en": "Full explanation text"
}

Rules:
- options_en: exactly 4 words/phrases. Remove letter prefixes like "A)", "A.", "(A)" etc.
  Input may look like: "A) miracle  B) delay  C) disaster  D) reward"
  Extract: ["miracle", "delay", "disaster", "reward"]
- correctIndex: 0=A, 1=B, 2=C, 3=D - from "Correct Answer: B" -> correctIndex = 1
- explanation_en: full text after "Explanation:" - empty string if missing
- NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        }
      } else if (quizType === "Error Correction") {
        if (isBatch) {
          systemPrompt = `You are a structured data extraction assistant for Error Correction / Error Spotting questions used in Indian competitive exams (SSC CGL, Bank PO, IBPS, Railway RRB, WBCS, etc.).
Convert ALL given raw error correction questions into a valid JSON array of objects.
Output ONLY the raw JSON array. No markdown fences, no extra text, no commentary.

Required JSON schema:
[
  {
    "id": <number>,
    "question_en": "Full sentence with part labels and / separators preserved exactly",
    "options_en": [
      "Part A text — NO letter prefix",
      "Part B text — NO letter prefix",
      "Part C text — NO letter prefix",
      "No Error"
    ],
    "correctIndex": 1,
    "explanation_en": "Explanation text, or empty string if none provided"
  }
]

━━━ STEP 1: BUILD question_en ━━━
The main sentence is divided into labelled parts (A/B/C/D or a/b/c/d).
Labels appear in many styles — all are equivalent:
  (A) (B) (C) (D)   |   a) b) c) d)   |   A. B. C. D.   |   [A] [B]   |   /a /b /c /d
Parts are separated by  /  or  //  or  |  or spaces.
question_en = FULL sentence keeping ALL part labels and separators exactly.
Strip only the leading serial number (1. / Q1. / Q.1 etc.) from the front.

━━━ STEP 2: BUILD options_en (always exactly 4 strings) ━━━
options_en[0] = text of part A  (strip label prefix: (A), A., a), [A] …)
options_en[1] = text of part B
options_en[2] = text of part C
options_en[3] = text of part D — almost always "No Error" / "No error" / "No mistake"
When 5 parts (a–e, with "No error" as part e): treat a–c as A–C and put "No error" as D.

━━━ STEP 3: FIND correctIndex (0=A, 1=B, 2=C, 3=D) ━━━
All of these mean correctIndex = 1 (error is in part B):
  Answer: (B)   Ans: (b)   Answer: B   Answer: Option B   The error is in B   01. b
Map: A/a→0, B/b→1, C/c→2, D/d/E/e→3.
When D/E = "No Error" and that is correct, correctIndex = 3.

━━━ STEP 4: EXTRACT explanation_en ━━━
Take everything after: "Explanation:", "Expl:", "Note:", "Rule:", "Reason:".
If absent → use "" (empty string, NOT null).

━━━ EXAMPLES ━━━

INPUT A (inline format):
  1. The committee rejected (A) / an unique proposal (B) / without further discussion. (C) / No Error (D)
  Answer: (B) Explanation: "Unique" begins with /yu/ sound, so use "a" not "an".

OUTPUT A:
  {"id":1,"question_en":"The committee rejected (A) / an unique proposal (B) / without further discussion. (C) / No Error (D)","options_en":["The committee rejected","an unique proposal","without further discussion.","No Error"],"correctIndex":1,"explanation_en":"Unique begins with /yu/ sound, so use a not an."}

INPUT B (lowercase 5-part):
  2. He commanded (a)/ me as if (b)/ he was (c)/ my husband. (d)/ No error (e)
  Answer: (c)  Explanation: Use "were" not "was" in conditional clauses.

OUTPUT B:
  {"id":2,"question_en":"He commanded (a)/ me as if (b)/ he was (c)/ my husband. (d)/ No error (e)","options_en":["He commanded","me as if","he was","No error"],"correctIndex":2,"explanation_en":"Use were not was in conditional clauses."}

INPUT C (Q-prefix, no explanation):
  Q3. She didn't went (A) / to school (B) / yesterday. (C) / No Error (D)
  Answer: A

OUTPUT C:
  {"id":3,"question_en":"She didn't went (A) / to school (B) / yesterday. (C) / No Error (D)","options_en":["She didn't went","to school","yesterday.","No Error"],"correctIndex":0,"explanation_en":""}

NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        } else {
          systemPrompt = `You are a structured data extraction assistant for Error Correction / Error Spotting questions used in Indian competitive exams (SSC CGL, Bank PO, IBPS, Railway RRB, WBCS, etc.).
Convert ONE raw error correction question into this exact JSON object.
Output ONLY the raw JSON. No markdown fences, no extra text, no commentary.

Required JSON schema:
{
  "id": <number>,
  "question_en": "Full sentence with part labels and / separators preserved exactly",
  "options_en": [
    "Part A text — NO letter prefix",
    "Part B text — NO letter prefix",
    "Part C text — NO letter prefix",
    "No Error"
  ],
  "correctIndex": 1,
  "explanation_en": "Explanation text, or empty string if none provided"
}

━━━ STEP 1: BUILD question_en ━━━
The main sentence is divided into labelled parts (A/B/C/D or a/b/c/d).
Labels appear in many styles — all are equivalent:
  (A) (B) (C) (D)   |   a) b) c) d)   |   A. B. C. D.   |   [A] [B]   |   /a /b /c /d
Parts are separated by  /  or  //  or  |  or spaces.
question_en = FULL sentence keeping ALL part labels and separators exactly.
Strip only the leading serial number (1. / Q1. / Q.1 etc.) from the front.

━━━ STEP 2: BUILD options_en (always exactly 4 strings) ━━━
options_en[0] = text of part A  (strip label prefix: (A), A., a), [A] …)
options_en[1] = text of part B
options_en[2] = text of part C
options_en[3] = text of part D — almost always "No Error" / "No error" / "No mistake"
When 5 parts (a–e, with "No error" as part e): treat a–c as A–C and put "No error" as D.

━━━ STEP 3: FIND correctIndex (0=A, 1=B, 2=C, 3=D) ━━━
All of these mean correctIndex = 1 (error is in part B):
  Answer: (B)   Ans: (b)   Answer: B   Answer: Option B   The error is in B   01. b
Map: A/a→0, B/b→1, C/c→2, D/d/E/e→3.
When D/E = "No Error" and that is correct, correctIndex = 3.

━━━ STEP 4: EXTRACT explanation_en ━━━
Take everything after: "Explanation:", "Expl:", "Note:", "Rule:", "Reason:".
If absent → use "" (empty string, NOT null).

━━━ EXAMPLES ━━━

INPUT A (inline format):
  1. The committee rejected (A) / an unique proposal (B) / without further discussion. (C) / No Error (D)
  Answer: (B) Explanation: "Unique" begins with /yu/ sound, so use "a" not "an".

OUTPUT A:
  {"id":1,"question_en":"The committee rejected (A) / an unique proposal (B) / without further discussion. (C) / No Error (D)","options_en":["The committee rejected","an unique proposal","without further discussion.","No Error"],"correctIndex":1,"explanation_en":"Unique begins with /yu/ sound, so use a not an."}

INPUT B (lowercase 5-part):
  2. He commanded (a)/ me as if (b)/ he was (c)/ my husband. (d)/ No error (e)
  Answer: (c)  Explanation: Use "were" not "was" in conditional clauses.

OUTPUT B:
  {"id":2,"question_en":"He commanded (a)/ me as if (b)/ he was (c)/ my husband. (d)/ No error (e)","options_en":["He commanded","me as if","he was","No error"],"correctIndex":2,"explanation_en":"Use were not was in conditional clauses."}

INPUT C (Q-prefix, no explanation):
  Q3. She didn't went (A) / to school (B) / yesterday. (C) / No Error (D)
  Answer: A

OUTPUT C:
  {"id":3,"question_en":"She didn't went (A) / to school (B) / yesterday. (C) / No Error (D)","options_en":["She didn't went","to school","yesterday.","No Error"],"correctIndex":0,"explanation_en":""}

NUMBERS: Always write all digits in English (0-9). Never use Bengali/Devanagari digits anywhere.`;
        }
      } else {
        systemPrompt = `Convert to JSON.`;
      }

      let lastError: any = null;
      let parsed = null;
      let activeKeyIndex = -1;

      // Rotate through available keys if failure occurs, with inner retries
      for (let i = 0; i < candidateKeys.length; i++) {
        const apiKey = candidateKeys[i];
        let attemptsCount = 0;
        const maxAttempts = 3;
        
        while (attemptsCount < maxAttempts && !parsed) {
          attemptsCount++;
          try {
            console.log(`[QUIZ-BUILDER-AI] Trying key ${i + 1}/${candidateKeys.length}, attempt ${attemptsCount}...`);
            const ai = new GoogleGenAI({ apiKey });

            let promptContent = rawText;
            if (passageContext && passageContext.trim() !== '') {
              promptContent = `[CONTEXT/PASSAGE FOR REFERENCE]:\n${passageContext}\n\n[QUESTION TO PARSE]:\n${rawText}`;
            }

            // 90-second timeout per Gemini call
            const abortCtrl = new AbortController();
            const timeoutId = setTimeout(() => abortCtrl.abort(), 90000);

            let geminiResponse: any;
            try {
              geminiResponse = await ai.models.generateContent({
                model: modelName || "gemini-2.0-flash",
                contents: promptContent,
                config: {
                  systemInstruction: systemPrompt,
                  temperature: 0,
                  responseMimeType: "application/json",
                  maxOutputTokens: 8192,
                }
              });
            } finally {
              clearTimeout(timeoutId);
            }

            const reply = geminiResponse?.text?.trim() || "";
            if (!reply) {
              throw new Error("Gemini returned an empty response. The input may be too large or the model is overloaded.");
            }

            let parsedResult: any;
            try {
              parsedResult = JSON.parse(reply);
            } catch (parseErr) {
              // Try to extract JSON from markdown-wrapped response
              const jsonMatch = reply.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
              if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[1]);
              } else {
                throw new Error(`Failed to parse JSON: ${(parseErr as Error).message}. Raw: ${reply.substring(0, 200)}`);
              }
            }

            parsed = parsedResult;
            activeKeyIndex = i;
            break; // success

          } catch (err: any) {
            lastError = err;
            console.error(`[QUIZ-BUILDER-AI] Error with key ${i + 1}, attempt ${attemptsCount}: ${err.message}`);
            if (err.message && (err.message.includes('429') || err.message.toLowerCase().includes('quota'))) {
              break; // quota error → try next key immediately
            }
            if (attemptsCount < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
        if (parsed) break;
      }

      if (!parsed) {
        const errDetails = lastError ? lastError.message : 'Unknown error';
        return res.status(500).json({
          error: `All (${candidateKeys.length}) API keys in your pool failed. Last API error: ${errDetails}`
        });
      }

      return res.status(200).json({ data: parsed, keyIndex: activeKeyIndex });

    } catch (err: any) {
      console.error('[QUIZ-BUILDER-AI] Unexpected error:', err);
      return res.status(500).json({ error: err.message || 'Unexpected server error' });
    }
  });

  // ── Vite / Static serving ──────────────────────────────────────────────
  if (!process.env.VERCEL) {
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      const viteModule = "vite";
      (async () => {
        const { createServer: createViteServer } = await import(viteModule);
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "custom",
        });
        app.use(vite.middlewares);
        app.use("*", async (req, res, next) => {
          try {
            const url = req.originalUrl;
            let template = fs.readFileSync(
              path.join(process.cwd(), "index.html"),
              "utf-8"
            );
            template = await vite.transformIndexHtml(url, template);
            res.status(200).set({ "Content-Type": "text/html" }).end(template);
          } catch (e: any) {
            vite.ssrFixStacktrace(e);
            next(e);
          }
        });
      })();
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return app;
}

if (!process.env.VERCEL) {
  const app = createExpressApp();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
