import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { ArrowRight, Camera, FileText, Loader2, Upload, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { library, fileToDataUrl } from "@/lib/library";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/add")({
  component: AddBookPage,
});

function AddBookPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [coverDataUrl, setCoverDataUrl] = useState<string>();
  const [content, setContent] = useState("");

  const [identifying, setIdentifying] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const pagesInputRef = useRef<HTMLInputElement>(null);
  const textFileRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setCoverDataUrl(dataUrl);
    setIdentifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("identify-book", {
        body: { imageBase64: dataUrl },
      });
      if (error) throw error;
      if (data?.title) {
        setTitle(data.title);
        if (data.author) setAuthor(data.author);
        toast.success(`זוהה: ${data.title}${data.author ? " — " + data.author : ""}`);
      } else {
        toast.warning("לא הצלחנו לזהות את הספר אוטומטית. הקלידו ידנית.");
      }
    } catch (err: any) {
      toast.error("שגיאה בזיהוי הספר", { description: String(err?.message ?? err) });
    } finally {
      setIdentifying(false);
    }
  };

  const handlePagesUpload = async (files: FileList) => {
    setExtracting(true);
    try {
      const texts: string[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file);
        const { data, error } = await supabase.functions.invoke("extract-text", {
          body: { imageBase64: dataUrl },
        });
        if (error) throw error;
        if (data?.text) texts.push(data.text);
      }
      setContent((prev) => (prev ? prev + "\n\n" + texts.join("\n\n") : texts.join("\n\n")));
      toast.success(`חולץ טקסט מ-${files.length} עמודים`);
    } catch (err: any) {
      toast.error("שגיאה בחילוץ טקסט", { description: String(err?.message ?? err) });
    } finally {
      setExtracting(false);
    }
  };

  const handleTextFile = async (file: File) => {
    const text = await file.text();
    setContent((prev) => (prev ? prev + "\n\n" + text : text));
    toast.success(`נטען קובץ: ${file.name}`);
  };

  const save = () => {
    if (!title.trim()) return toast.error("יש להזין שם ספר");
    if (!content.trim()) return toast.error("יש להוסיף את תוכן הספר");
    const book = library.add({
      title: title.trim(),
      author: author.trim() || undefined,
      coverDataUrl,
      content: content.trim(),
    });
    toast.success("הספר נוסף לספרייה");
    navigate({ to: "/reader/$id", params: { id: book.id } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-background">
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/70 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm hover:underline">
            <ArrowRight className="w-4 h-4" /> חזרה לספרייה
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-bold font-serif-he">הוספת ספר</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Step 1: Identify */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-sm font-bold">
              1
            </div>
            <h2 className="text-lg font-bold">איזה ספר?</h2>
          </div>

          <div className="grid sm:grid-cols-[180px_1fr] gap-5">
            <div>
              <button
                onClick={() => coverInputRef.current?.click()}
                className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-border hover:border-primary bg-muted/30 transition-colors grid place-items-center overflow-hidden"
              >
                {coverDataUrl ? (
                  <img src={coverDataUrl} alt="כריכה" className="w-full h-full object-cover" />
                ) : identifying ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                ) : (
                  <div className="text-center p-4">
                    <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <span className="text-xs text-muted-foreground">
                      צלמו או העלו תמונה של הכריכה
                    </span>
                  </div>
                )}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="title">שם הספר</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="לדוגמה: הקיבוצניק האחרון"
                  dir="rtl"
                />
              </div>
              <div>
                <Label htmlFor="author">מחבר (אופציונלי)</Label>
                <Input
                  id="author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="לדוגמה: דויד גרוסמן"
                  dir="rtl"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                העלאת תמונה של הכריכה תמלא את השדות אוטומטית.
              </p>
            </div>
          </div>
        </section>

        {/* Step 2: Content */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-sm font-bold">
              2
            </div>
            <h2 className="text-lg font-bold">תוכן הספר להקראה</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Button
              variant="outline"
              onClick={() => textFileRef.current?.click()}
              className="gap-2 justify-start"
            >
              <FileText className="w-4 h-4" /> טעינת קובץ טקסט
            </Button>
            <Button
              variant="outline"
              onClick={() => pagesInputRef.current?.click()}
              disabled={extracting}
              className="gap-2 justify-start"
            >
              {extracting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              צילום עמודים (OCR)
            </Button>
            <input
              ref={textFileRef}
              type="file"
              accept=".txt,.md,text/plain"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleTextFile(e.target.files[0])}
            />
            <input
              ref={pagesInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handlePagesUpload(e.target.files)}
            />
          </div>

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="הדביקו או הקלידו כאן את הטקסט להקראה, או השתמשו בכפתורים למעלה כדי לטעון אותו אוטומטית..."
            dir="rtl"
            rows={12}
            className="font-serif-he text-base leading-relaxed"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {content.length.toLocaleString("he-IL")} תווים
          </p>
        </section>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate({ to: "/" })}>
            ביטול
          </Button>
          <Button onClick={save} disabled={!title || !content}>
            שמור והתחל להקריא
          </Button>
        </div>
      </main>
    </div>
  );
}
