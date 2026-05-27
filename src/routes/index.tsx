import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, Plus, Trash2, Clock } from "lucide-react";
import { library, type Book } from "@/lib/library";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: LibraryPage,
});

function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setBooks(library.list());
  }, []);

  const remove = (id: string) => {
    if (!confirm("למחוק את הספר מהספרייה?")) return;
    library.remove(id);
    setBooks(library.list());
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-background">
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/70 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-serif-he">ספרי קול</h1>
              <p className="text-xs text-muted-foreground">הקראת ספרים בעברית</p>
            </div>
          </div>
          <Button onClick={() => navigate({ to: "/add" })} className="gap-2">
            <Plus className="w-4 h-4" /> הוסף ספר
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {books.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {books.map((b) => (
              <BookCard key={b.id} book={b} onRemove={() => remove(b.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function BookCard({ book, onRemove }: { book: Book; onRemove: () => void }) {
  const pct = book.content.length
    ? Math.min(100, Math.round(((book.progress ?? 0) / book.content.length) * 100))
    : 0;
  return (
    <div className="group relative rounded-2xl overflow-hidden border border-border bg-card hover:shadow-lg transition-shadow">
      <Link to="/reader/$id" params={{ id: book.id }} className="block">
        <div className="aspect-[3/4] bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 relative overflow-hidden">
          {book.coverDataUrl ? (
            <img
              src={book.coverDataUrl}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <span className="font-serif-he text-2xl text-amber-900 dark:text-amber-100 font-bold leading-tight">
                {book.title}
              </span>
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-bold text-base line-clamp-1">{book.title}</h3>
          {book.author && (
            <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
              {book.author}
            </p>
          )}
          {pct > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span>{pct}%</span>
            </div>
          )}
        </div>
      </Link>
      <button
        onClick={onRemove}
        className="absolute top-2 left-2 w-8 h-8 rounded-full bg-background/80 backdrop-blur grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
        aria-label="מחק"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 grid place-items-center mx-auto mb-6">
        <BookOpen className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold font-serif-he mb-2">הספרייה שלך ריקה</h2>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        הוסיפו ספר חדש על ידי צילום הכריכה או הקלדת שם הספר, והאתר ידע להקריא אותו לכם בעברית.
      </p>
      <Link
        to="/add"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
      >
        <Plus className="w-4 h-4" /> הוסף את הספר הראשון
      </Link>
    </div>
  );
}
