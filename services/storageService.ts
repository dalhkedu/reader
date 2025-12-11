import { Book, PdfParseResult, Bookmark, PdfMetadata } from '../types';

const DB_NAME = 'LuminaDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

// Robust ID generation (Fallback for non-secure contexts)
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => reject('Database error: ' + (event.target as any).error);

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveBook = async (pdfResult: PdfParseResult, pdfData: ArrayBuffer): Promise<Book> => {
  const db = await openDB();
  const id = generateId();
  
  const book: Book = {
    id,
    metadata: pdfResult.metadata,
    chunks: pdfResult.chunks,
    outline: pdfResult.outline,
    bookmarks: [],
    progressIndex: 0,
    createdAt: Date.now(),
    pdfData: pdfData
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(book);

    request.onsuccess = () => resolve(book);
    request.onerror = () => reject('Error saving book');
  });
};

export const getLibrary = async (): Promise<Book[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by recently added
      const books = (request.result as Book[]).sort((a, b) => b.createdAt - a.createdAt);
      resolve(books);
    };
    request.onerror = () => reject('Error fetching library');
  });
};

export const getBook = async (id: string): Promise<Book | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject('Error fetching book');
  });
};

export const updateProgress = async (id: string, index: number): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // First get the book to ensure we don't overwrite other fields
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const data = getReq.result as Book;
      if (data) {
        data.progressIndex = index;
        store.put(data); // Put updates the record
        resolve();
      } else {
        reject('Book not found');
      }
    };
    getReq.onerror = () => reject('Error updating progress');
  });
};

export const updateBookMetadata = async (id: string, metadata: PdfMetadata): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const data = getReq.result as Book;
      if (data) {
        data.metadata = metadata;
        store.put(data);
        resolve();
      } else {
        reject('Book not found');
      }
    };
    getReq.onerror = () => reject('Error updating metadata');
  });
};

export const addBookmark = async (bookId: string, bookmark: Bookmark): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(bookId);

    getReq.onsuccess = () => {
      const data = getReq.result as Book;
      if (data) {
        // Initialize if missing (backward compatibility)
        if (!data.bookmarks) data.bookmarks = [];
        data.bookmarks.push(bookmark);
        store.put(data);
        resolve();
      } else {
        reject('Book not found');
      }
    };
    getReq.onerror = () => reject('Error adding bookmark');
  });
};

export const removeBookmark = async (bookId: string, bookmarkId: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(bookId);

    getReq.onsuccess = () => {
      const data = getReq.result as Book;
      if (data) {
        if (!data.bookmarks) data.bookmarks = [];
        data.bookmarks = data.bookmarks.filter(b => b.id !== bookmarkId);
        store.put(data);
        resolve();
      } else {
        reject('Book not found');
      }
    };
    getReq.onerror = () => reject('Error removing bookmark');
  });
};

export const deleteBook = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    transaction.oncomplete = () => resolve();
    request.onerror = () => reject('Error deleting book');
  });
};