// LocalStorage-backed library of user's books
export type Book = {
  id: string;
  title: string;
  author?: string;
  coverDataUrl?: string;
  content: string; // full Hebrew text
  createdAt: number;
  progress?: number; // last character index reached
};

const KEY = "sifrei-kol.library.v1";

function read(): Book[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(books: Book[]) {
  localStorage.setItem(KEY, JSON.stringify(books));
}

export const library = {
  list(): Book[] {
    return read().sort((a, b) => b.createdAt - a.createdAt);
  },
  get(id: string): Book | undefined {
    return read().find((b) => b.id === id);
  },
  add(book: Omit<Book, "id" | "createdAt">): Book {
    const newBook: Book = {
      ...book,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const all = read();
    all.push(newBook);
    write(all);
    return newBook;
  },
  update(id: string, patch: Partial<Book>) {
    const all = read();
    const idx = all.findIndex((b) => b.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      write(all);
    }
  },
  remove(id: string) {
    write(read().filter((b) => b.id !== id));
  },
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
