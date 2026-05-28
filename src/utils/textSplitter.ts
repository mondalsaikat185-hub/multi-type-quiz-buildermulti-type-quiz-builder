/**
 * textSplitter.ts
 *
 * Robust question-block splitter — ported & enhanced from GK Quiz Tool (app.py).
 * Normalises every unusual serial-number style before splitting so the boundary
 * detector always works, regardless of how the AI, OCR, or human formatted them.
 */

// Bengali digit to Arabic map
const BN_DIGIT: Record<string, string> = {
  '০':'0','১':'1','২':'2','৩':'3','৪':'4',
  '৫':'5','৬':'6','৭':'7','৮':'8','৯':'9',
};
function bnToArabic(s: string): string {
  return s.replace(/[০-৯]/g, (c) => BN_DIGIT[c] ?? c);
}

/**
 * normaliseQuestionNumbers
 *
 * Converts every unusual serial-number style at line-start into plain "N. " prefix.
 *
 * Handled styles:
 *   1/.  1//.         slash variants
 *   1).               paren then period
 *   [Question 1]      word bracket (Bengali/English/Q)
 *   [1]  [1].         plain square bracket
 *   #1   #1.  #1)     hash prefix
 *   No.1  No. 1       No. prefix
 *   Question 1.       full word Question/Ques
 *   1 -  1-  1--      dash separator
 *   1 >  1>           arrow/greater-than
 *   Bengali numerals  converted to Arabic
 *   1. Q1.  (double)  doubled prefix stripped
 */
function normaliseQuestionNumbers(txt: string): string {
  // Ensure newlines before inline question boundaries like " Q2. " or " Question 2: "
  txt = txt.replace(/(\s+)(Q(?:uestion)?\.?\s*\d+\s*[.):>])/gi, '\n$2');

  // Strip doubled prefix: "1. Q1." -> "1."
  txt = txt.replace(/^([ \t]*)\d+[.)]\s*(?=Q\.?\s*\d+\s*[.):)])/gm, '$1');

  // Slash variants: 1/.  1//.  Q1/.
  txt = txt.replace(/^([ \t]*(?:Q\.?\s*)?\d+)\s*\/+\.?/gm, '$1. ');

  // Paren then period: 1).
  txt = txt.replace(/^([ \t]*(?:Q\.?\s*)?\d+)\s*\)\s*\./gm, '$1. ');

  // Bengali/English/Q bracket: [প্রশ্ন ১] [Question 1] [Q 1]
  txt = txt.replace(
    /^[ \t]*\[(?:প্রশ্ন|Question|Q)\.?\s*([০-৯0-9]+)\]\s*/gim,
    (_m: string, num: string) => bnToArabic(num) + '. ',
  );

  // Plain square brackets: [1]  [1].
  txt = txt.replace(/^[ \t]*\[([0-9]+)\]\s*\.?/gm, '$1. ');

  // Hash prefix: #1  #1.  #1)
  txt = txt.replace(/^[ \t]*#([0-9]+)\s*[.)]?\s*/gm, '$1. ');

  // No. prefix: No.1  No. 1  no 1.
  txt = txt.replace(/^[ \t]*[Nn][Oo]\.?\s*([0-9]+)\s*[.)]?\s*/gm, '$1. ');

  // Full word Question/Ques: Question 1.  Ques1:
  txt = txt.replace(/^[ \t]*[Qq]ues(?:tion)?\.?\s*([0-9]+)\s*[.):]*\s*/gm, '$1. ');

  // Dash/em-dash separator: 1 -  1-  1--  1--  1–  1—
  txt = txt.replace(/^([ \t]*\d+)\s*[-–—]+\s*/gm, '$1. ');

  // Arrow/greater-than: 1 >  1>  1→  1►
  txt = txt.replace(/^([ \t]*\d+)\s*[>→►]+\s*/gm, '$1. ');

  // Bengali-only numeral lines: ১. ২) -> 1. 2.
  txt = txt.replace(/^[ \t]*([০-৯]+)\s*[.)।]/gm, (_m: string, n: string) => bnToArabic(n) + '. ');

  return txt;
}

/**
 * doSplit - core splitter after normalisation.
 * Captures preamble before first question (e.g. a passage).
 */
function doSplit(text: string): string[] {
  // After normalisation, boundaries are: N.  N)  N:  Q1.  Q1)  (N)  Question N  and Bengali equivalents
  const boundaryRe = /^(?:[ \t]*)(?:Q\.?\s*\d+\s*[.):>]|\d+\s*[.):>](?!\d)|\(\d+\)|প্রশ্ন\s*\d+|Question\s*\d+)/gim;

  let match: RegExpExecArray | null;
  const indices: number[] = [];
  while ((match = boundaryRe.exec(text)) !== null) {
    indices.push(match.index);
  }

  if (indices.length === 0) {
    return text.split(/\n\s*\n\s*\n/).map((s: string) => s.trim()).filter(Boolean);
  }

  const blocks: string[] = [];

  if (indices[0] > 0) {
    const before = text.slice(0, indices[0]).trim();
    if (before) blocks.push(before);
  }

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end   = i === indices.length - 1 ? text.length : indices[i + 1];
    const block = text.slice(start, end).trim();
    if (block) blocks.push(block);
  }

  return blocks;
}

/**
 * splitQuestionBlocks - public entry point.
 *
 * @param rawText   Raw pasted text from the user
 * @param quizType  One of the 8 QuizType values
 * @returns         Array of question blocks. For Passage/Cloze, index 0 may be the passage.
 */
export function splitQuestionBlocks(rawText: string, quizType: string): string[] {
  const text = normaliseQuestionNumbers(rawText);

  // Cloze: split on "Questions:" separator, extract passage before it
  if (quizType === 'Cloze') {
    const markerMatch = text.match(/\bquestions\s*:/i);
    if (markerMatch) {
      const splitIdx      = text.search(/\bquestions\s*:/i);
      const passageRaw    = text.slice(0, splitIdx);
      const questionsText = text.slice(splitIdx + markerMatch[0].length);
      const passage = passageRaw
        .replace(/^[ \t]*passage(?:\s*\(with blanks\))?[ \t]*:?[ \t]*/im, '')
        .trim();
      const qBlocks = doSplit(questionsText);
      return passage ? [passage, ...qBlocks] : qBlocks;
    }
  }

  return doSplit(text);
}
