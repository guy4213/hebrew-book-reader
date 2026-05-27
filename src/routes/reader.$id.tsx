import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Loader2,
  BookOpen,
  AlignLeft,
  Settings,
  Volume2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { library, type Book } from "@/lib/library";
import { generateTTS, chunkText, HEBREW_VOICES, type WordSpan } from "@/lib/tts";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reader/$id")({
  component: ReaderPage,
});

type ViewMode = "book" | "plain";

function ReaderPage() {
  const { id } = useParams({ from: "/reader/$id" });
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);

  // chunks of text we'll stream sequentially
  const chunks = useMemo(() => (book ? chunkText(book.content) : []), [book]);

  const [chunkIdx, setChunkIdx] = useState(0);
  const [words, setWords] = useState<WordSpan[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState(-1);

  const [voiceId, setVoiceId] = useState(HEBREW_VOICES[0].id);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [fontSize, setFontSize] = useState(20);
  const [viewMode, setViewMode] = useState<ViewMode>("plain");
  const [theme, setTheme] = useState<"cream" | "white" | "dark">("cream");

  const audioRef = useRef<HTMLAudioElement>(null);

  // Load book from storage
  useEffect(() => {
    const b = library.get(id);
    if (!b) {
      toast.error("הספר לא נמצא");
      navigate({ to: "/" });
      return;
    }
    setBook(b);
  }, [id, navigate]);

  // When chunk changes (or voice/speed), generate audio
  useEffect(() => {
    if (!book || chunks.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setAudioUrl(null);
    setWords([]);
    setCurrentWordIdx(-1);
    generateTTS(chunks[chunkIdx], voiceId, 1) // speed handled client-side via playbackRate
      .then((res) => {
        if (cancelled) return;
        setAudioUrl(res.audioUrl);
        setWords(res.words);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error("שגיאה ביצירת ההקראה", {
          description: String(err?.message ?? err),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chunks, chunkIdx, voiceId, book]);

  // Apply speed and volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
      audioRef.current.volume = volume;
    }
  }, [speed, volume, audioUrl]);

  // Track current word via timeupdate
  const handleTimeUpdate = () => {
    const t = audioRef.current?.currentTime ?? 0;
    // binary search would be nicer; linear is fine for small chunks
    let idx = -1;
    for (let i = 0; i < words.length; i++) {
      if (t >= words[i].timeStart && t <= words[i].timeEnd + 0.05) {
        idx = i;
        break;
      }
      if (t < words[i].timeStart) {
        idx = i - 1;
        break;
      }
    }
    if (idx === -1 && words.length && t > words[words.length - 1].timeEnd) {
      idx = words.length - 1;
    }
    if (idx !== currentWordIdx) {
      setCurrentWordIdx(idx);
      if (book) {
        // save progress relative to whole book
        const charsBefore = chunks.slice(0, chunkIdx).reduce((s, c) => s + c.length + 2, 0);
        const wordChar = idx >= 0 ? words[idx].charStart : 0;
        library.update(book.id, { progress: charsBefore + wordChar });
      }
    }
  };

  const handleEnded = () => {
    if (chunkIdx + 1 < chunks.length) {
      setChunkIdx((i) => i + 1);
      // autoplay will resume on next chunk via effect below
    } else {
      setPlaying(false);
    }
  };

  // Autoplay when new audio loads if we were playing
  useEffect(() => {
    if (audioUrl && playing && audioRef.current) {
      audioRef.current.play().catch(() => setPlaying(false));
    }
  }, [audioUrl, playing]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      setPlaying(true);
    } else {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  const seek = (delta: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + delta);
  };

  if (!book) return null;

  const themeBg = {
    cream: "bg-[#faf6ed] text-[#2a2620]",
    white: "bg-white text-zinc-900",
    dark: "bg-zinc-900 text-zinc-100",
  }[theme];

  return (
    <div className={cn("min-h-screen flex flex-col", themeBg)}>
      {/* Header */}
      <header className="border-b border-border/30 backdrop-blur-sm bg-background/40 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 text-sm hover:underline shrink-0">
            <ArrowRight className="w-4 h-4" /> ספרייה
          </Link>
          <div className="text-center min-w-0">
            <h1 className="font-bold font-serif-he truncate text-base">{book.title}</h1>
            {book.author && (
              <p className="text-xs opacity-70 truncate">{book.author}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode(viewMode === "book" ? "plain" : "book")}
              title={viewMode === "book" ? "תצוגת טקסט" : "תצוגת ספר"}
            >
              {viewMode === "book" ? (
                <AlignLeft className="w-4 h-4" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
            </Button>
            <SettingsPopover
              voiceId={voiceId}
              setVoiceId={setVoiceId}
              speed={speed}
              setSpeed={setSpeed}
              volume={volume}
              setVolume={setVolume}
              fontSize={fontSize}
              setFontSize={setFontSize}
              theme={theme}
              setTheme={setTheme}
            />
          </div>
        </div>
      </header>

      {/* Reader body */}
      <main className="flex-1 overflow-hidden">
        {viewMode === "plain" ? (
          <PlainView
            text={chunks[chunkIdx] ?? ""}
            words={words}
            currentWordIdx={currentWordIdx}
            fontSize={fontSize}
          />
        ) : (
          <BookView
            text={chunks[chunkIdx] ?? ""}
            words={words}
            currentWordIdx={currentWordIdx}
            fontSize={fontSize}
          />
        )}
      </main>

      {/* Player */}
      <footer className="border-t border-border/30 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 mb-2 text-xs opacity-70">
            <span>
              קטע {chunkIdx + 1} / {chunks.length}
            </span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${((chunkIdx + 1) / chunks.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChunkIdx((i) => Math.max(0, i - 1))}
              disabled={chunkIdx === 0}
              title="קטע קודם"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => seek(-15)} title="חזרה 15 שניות">
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button
              size="icon"
              className="w-14 h-14 rounded-full"
              onClick={togglePlay}
              disabled={loading || !audioUrl}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : playing ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => seek(15)} title="קדימה 15 שניות">
              <SkipForward className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChunkIdx((i) => Math.min(chunks.length - 1, i + 1))}
              disabled={chunkIdx >= chunks.length - 1}
              title="קטע הבא"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </footer>
    </div>
  );
}

/* ---------- Plain text view ---------- */
function PlainView({
  text,
  words,
  currentWordIdx,
  fontSize,
}: {
  text: string;
  words: WordSpan[];
  currentWordIdx: number;
  fontSize: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active word
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-w="${currentWordIdx}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentWordIdx]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto px-6 py-10"
      style={{ direction: "rtl" }}
    >
      <div
        className="max-w-2xl mx-auto font-serif-he leading-loose whitespace-pre-wrap"
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}
      >
        <RenderTokens text={text} words={words} currentWordIdx={currentWordIdx} />
      </div>
    </div>
  );
}

/* ---------- Virtual book view (two facing pages) ---------- */
function BookView({
  text,
  words,
  currentWordIdx,
  fontSize,
}: {
  text: string;
  words: WordSpan[];
  currentWordIdx: number;
  fontSize: number;
}) {
  return (
    <div className="h-full overflow-hidden grid place-items-center p-4 sm:p-8">
      <div className="w-full max-w-5xl h-full grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[calc(100vh-220px)]">
        <BookPage side="right" pageNum={1}>
          <div
            className="font-serif-he leading-loose whitespace-pre-wrap"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}
          >
            <RenderTokens text={text} words={words} currentWordIdx={currentWordIdx} />
          </div>
        </BookPage>
        <BookPage side="left" pageNum={2} className="hidden md:flex">
          <p className="text-sm opacity-50 self-center mx-auto">
            התצוגה ממשיכה לקטע הבא אוטומטית
          </p>
        </BookPage>
      </div>
    </div>
  );
}

function BookPage({
  children,
  side,
  pageNum,
  className,
}: {
  children: React.ReactNode;
  side: "left" | "right";
  pageNum: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "book-page rounded-lg p-6 sm:p-10 overflow-y-auto flex flex-col",
        side === "right" ? "rounded-r-2xl" : "rounded-l-2xl",
        className
      )}
      style={{ direction: "rtl" }}
    >
      <div className="flex-1">{children}</div>
      <div className="text-center text-xs opacity-50 pt-4">— {pageNum} —</div>
    </div>
  );
}

/* ---------- Token renderer with word highlight ---------- */
function RenderTokens({
  text,
  words,
  currentWordIdx,
}: {
  text: string;
  words: WordSpan[];
  currentWordIdx: number;
}) {
  if (words.length === 0) {
    return <span className="opacity-60">{text}</span>;
  }
  // Build segments: spaces between word spans + words
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  words.forEach((w, i) => {
    if (w.charStart > cursor) {
      nodes.push(text.slice(cursor, w.charStart));
    }
    nodes.push(
      <span
        key={i}
        data-w={i}
        className={i === currentWordIdx ? "word-highlight" : undefined}
      >
        {text.slice(w.charStart, w.charEnd)}
      </span>
    );
    cursor = w.charEnd;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

/* ---------- Settings popover ---------- */
function SettingsPopover(props: {
  voiceId: string;
  setVoiceId: (v: string) => void;
  speed: number;
  setSpeed: (v: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  fontSize: number;
  setFontSize: (v: number) => void;
  theme: "cream" | "white" | "dark";
  setTheme: (v: "cream" | "white" | "dark") => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="הגדרות">
          <Settings className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4" align="end">
        <div>
          <Label className="text-xs mb-1.5 block">קול הקריין</Label>
          <Select value={props.voiceId} onValueChange={props.setVoiceId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEBREW_VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs mb-1.5 flex justify-between">
            <span>מהירות</span>
            <span className="opacity-70">{props.speed.toFixed(2)}×</span>
          </Label>
          <Slider
            value={[props.speed]}
            onValueChange={([v]) => props.setSpeed(v)}
            min={0.5}
            max={2}
            step={0.05}
          />
        </div>

        <div>
          <Label className="text-xs mb-1.5 flex justify-between">
            <span className="flex items-center gap-1">
              <Volume2 className="w-3 h-3" /> ווליום
            </span>
            <span className="opacity-70">{Math.round(props.volume * 100)}%</span>
          </Label>
          <Slider
            value={[props.volume]}
            onValueChange={([v]) => props.setVolume(v)}
            min={0}
            max={1}
            step={0.05}
          />
        </div>

        <div>
          <Label className="text-xs mb-1.5 flex justify-between">
            <span>גודל פונט</span>
            <span className="opacity-70">{props.fontSize}px</span>
          </Label>
          <Slider
            value={[props.fontSize]}
            onValueChange={([v]) => props.setFontSize(v)}
            min={14}
            max={32}
            step={1}
          />
        </div>

        <div>
          <Label className="text-xs mb-1.5 block">רקע</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["cream", "white", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => props.setTheme(t)}
                className={cn(
                  "h-9 rounded-md border-2 text-xs",
                  props.theme === t ? "border-primary" : "border-border",
                  t === "cream" && "bg-[#faf6ed] text-[#2a2620]",
                  t === "white" && "bg-white text-zinc-900",
                  t === "dark" && "bg-zinc-900 text-zinc-100"
                )}
              >
                {t === "cream" ? "קרם" : t === "white" ? "לבן" : "כהה"}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
