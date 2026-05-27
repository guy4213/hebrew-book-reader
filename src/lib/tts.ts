import { supabase } from "@/integrations/supabase/client";

export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type TTSResult = {
  audioUrl: string;
  alignment: Alignment;
  // word index ranges in the original text (start char, end char exclusive, midTime)
  words: WordSpan[];
};

export type WordSpan = {
  text: string;
  charStart: number; // index in original text
  charEnd: number;
  timeStart: number;
  timeEnd: number;
};

export const HEBREW_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "שרה" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "ג'ורג'" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "צ'רלי" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "מטילדה" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "ג'סיקה" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "דניאל" },
];

export async function generateTTS(
  text: string,
  voiceId: string,
  speed: number
): Promise<TTSResult> {
  const { data, error } = await supabase.functions.invoke("tts-generate", {
    body: { text, voiceId, speed },
  });
  if (error) throw error;
  if (!data?.audioBase64) throw new Error("לא התקבל קובץ אודיו");

  const alignment: Alignment = data.alignment;
  const audioUrl = `data:audio/mpeg;base64,${data.audioBase64}`;

  // Group characters into words using the original text (preserves spaces faithfully)
  const words = buildWords(text, alignment);
  return { audioUrl, alignment, words };
}

function buildWords(text: string, alignment: Alignment): WordSpan[] {
  // ElevenLabs returns characters that correspond to the *spoken* text. We assume
  // it equals the input text. Map word boundaries on the original text and read
  // timestamps from the parallel alignment arrays.
  const words: WordSpan[] = [];
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const n = Math.min(text.length, chars.length);

  let i = 0;
  while (i < n) {
    // skip whitespace
    while (i < n && /\s/.test(text[i])) i++;
    if (i >= n) break;
    const wStart = i;
    const tStart = starts[i] ?? 0;
    while (i < n && !/\s/.test(text[i])) i++;
    const wEnd = i;
    const tEnd = ends[Math.max(wStart, wEnd - 1)] ?? tStart;
    words.push({
      text: text.slice(wStart, wEnd),
      charStart: wStart,
      charEnd: wEnd,
      timeStart: tStart,
      timeEnd: tEnd,
    });
  }
  return words;
}

export function chunkText(text: string, maxLen = 1200): string[] {
  // Split on paragraph then sentence boundaries, keeping chunks <= maxLen.
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buf = "";
  const push = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length <= maxLen) {
      buf = buf ? buf + "\n\n" + p : p;
    } else {
      push();
      if (p.length <= maxLen) {
        buf = p;
      } else {
        // Sentence-level split
        const parts = p.split(/(?<=[.!?؟।])\s+/);
        for (const s of parts) {
          if ((buf + " " + s).length <= maxLen) buf = buf ? buf + " " + s : s;
          else {
            push();
            buf = s;
          }
        }
      }
    }
  }
  push();
  return chunks.length ? chunks : [text];
}
