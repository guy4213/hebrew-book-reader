// Microsoft Edge TTS — uses the same neural voices as Azure Cognitive Services, no API key needed.
// Hebrew voices: he-IL-HilaNeural (female), he-IL-AvriNeural (male)
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WordBoundary {
  text: string;
  timeStart: number;
  timeEnd: number;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function edgeTTS(
  text: string,
  voice: string,
  rate: number
): Promise<{ audioBase64: string; words: WordBoundary[] }> {
  const requestId = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  const wsUrl =
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${requestId}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    (ws as WebSocket & { binaryType: string }).binaryType = "arraybuffer";

    const audioChunks: Uint8Array[] = [];
    const words: WordBoundary[] = [];

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Edge TTS timeout after 9s"));
    }, 9000);

    ws.onopen = () => {
      const ts = new Date().toISOString();

      // 1. Speech config — enable word boundary events, MP3 output
      ws.send(
        `Path: speech.config\r\nX-RequestId: ${requestId}\r\nX-Timestamp: ${ts}\r\n` +
          `Content-Type: application/json\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`
      );

      // 2. SSML — rate expressed as ±N%
      const ratePercent = Math.round((rate - 1) * 100);
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
      const lang = voice.startsWith("he-") ? "he-IL" : "he-IL";
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'><prosody rate='${rateStr}'>${escapeXml(text)}</prosody></voice></speak>`;

      ws.send(
        `Path: ssml\r\nX-RequestId: ${requestId}\r\nX-Timestamp: ${ts}\r\n` +
          `Content-Type: application/ssml+xml\r\n\r\n${ssml}`
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary message: [2-byte header length][header bytes][audio bytes]
        const view = new DataView(event.data);
        const headerLen = view.getUint16(0);
        const audio = new Uint8Array(event.data, 2 + headerLen);
        if (audio.length > 0) audioChunks.push(new Uint8Array(audio));
      } else if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();

          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
          const combined = new Uint8Array(totalLen);
          let off = 0;
          for (const chunk of audioChunks) {
            combined.set(chunk, off);
            off += chunk.length;
          }
          resolve({ audioBase64: encodeBase64(combined), words });
        } else if (event.data.includes("Path:audio.metadata")) {
          // Word boundary JSON follows the headers
          const jsonStart = event.data.indexOf("{");
          if (jsonStart !== -1) {
            try {
              const meta = JSON.parse(event.data.slice(jsonStart));
              for (const item of meta.Metadata ?? []) {
                if (item.Type === "WordBoundary") {
                  const offsetSec = item.Data.Offset / 10_000_000;
                  const durSec = item.Data.Duration / 10_000_000;
                  const wordText = item.Data.text?.Text ?? "";
                  if (wordText) {
                    words.push({
                      text: wordText,
                      timeStart: offsetSec,
                      timeEnd: offsetSec + durSec,
                    });
                  }
                }
              }
            } catch {
              // ignore malformed metadata
            }
          }
        }
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Edge TTS WebSocket error"));
    };

    ws.onclose = (event: CloseEvent) => {
      if (event.code !== 1000 && audioChunks.length === 0) {
        clearTimeout(timeout);
        reject(new Error(`Edge TTS closed unexpectedly: ${event.code}`));
      }
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, voice = "he-IL-HilaNeural", speed = 1.0 } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioBase64, words } = await edgeTTS(text.slice(0, 4900), voice, speed);

    return new Response(JSON.stringify({ audioBase64, words }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
