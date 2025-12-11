import { TextChunk, PdfOutline, PdfParseResult, PdfMetadata } from '../types';
import { PDFDocument } from 'pdf-lib';

declare const pdfjsLib: any;

const normalizeText = (text: string): string => {
  return text
    // Ligatures
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'ft')
    .replace(/\uFB06/g, 'st')
    // Smart Quotes & Apostrophes
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    // Dashes & Hyphens
    .replace(/[\u2013\u2014]/g, '-')
    // Ellipsis
    .replace(/\u2026/g, '...')
    // Spaces (NBSP, etc)
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    // Soft Hyphens (often used for line breaks in PDF, remove them)
    .replace(/\u00AD/g, '')
    // Normalization
    .normalize('NFKC')
    // Remove control characters but keep newlines for paragraph detection
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
};

const chunkPageText = (text: string, pageNumber: number, startId: number): TextChunk[] => {
  // Split by double newline to detect paragraphs
  const rawParagraphs = text.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];
  let idCounter = startId;
  const MAX_CHUNK_LENGTH = 1000;

  rawParagraphs.forEach((para) => {
    // Normalize spaces within the paragraph
    const cleanedPara = para.replace(/\s+/g, ' ').trim();
    if (cleanedPara.length === 0) return;

    if (cleanedPara.length <= MAX_CHUNK_LENGTH) {
      chunks.push({ id: idCounter++, text: cleanedPara, pageNumber });
    } else {
      // Split long paragraphs by sentences
      const sentences = cleanedPara.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [cleanedPara];
      let currentSubChunk = '';

      sentences.forEach((sentence) => {
        if ((currentSubChunk + sentence).length > MAX_CHUNK_LENGTH) {
          if (currentSubChunk) {
            chunks.push({ id: idCounter++, text: currentSubChunk.trim(), pageNumber });
          }
          currentSubChunk = sentence;
        } else {
          currentSubChunk += sentence;
        }
      });

      if (currentSubChunk) {
        chunks.push({ id: idCounter++, text: currentSubChunk.trim(), pageNumber });
      }
    }
  });

  return chunks;
};

// Helper to recursively process outline nodes
const processOutline = async (pdf: any, nodes: any[]): Promise<PdfOutline[]> => {
  const result: PdfOutline[] = [];

  for (const node of nodes) {
    let pageNumber: number | null = null;

    try {
      if (node.dest) {
        let dest = node.dest;
        // If dest is a string, we need to look it up in the named destinations
        if (typeof dest === 'string') {
          dest = await pdf.getDestination(dest);
        }
        
        // If we have a valid array destination (Ref, etc)
        if (Array.isArray(dest)) {
          // getPageIndex returns 0-based index
          const pageIndex = await pdf.getPageIndex(dest[0]);
          pageNumber = pageIndex + 1;
        }
      }
    } catch (e) {
      console.warn('Could not resolve outline destination', e);
    }

    const item: PdfOutline = {
      title: node.title,
      pageNumber,
      items: await processOutline(pdf, node.items || [])
    };
    
    result.push(item);
  }

  return result;
};

const generateCoverImage = async (pdf: any): Promise<string | null> => {
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 }); // Good quality thumbnail
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) return null;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    console.warn("Could not generate cover image", e);
    return null;
  }
};

// --- METADATA ENHANCEMENT HELPERS ---

// 1. Regex Heuristics from First Pages
const extractMetadataFromContent = (text: string): Partial<PdfMetadata> => {
  const meta: Partial<PdfMetadata> = {};
  
  // Try to find Author ("By [Name]")
  // Matches "By John Doe" or "By: John Doe" at start of lines
  const authorMatch = text.match(/(?:By|Author|Written by)[:\s]+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+)+)/i);
  if (authorMatch) {
    meta.author = authorMatch[1].trim();
  }

  // Try to find Edition ("2nd Edition", "Third Edition")
  const editionMatch = text.match(/(\d+(?:st|nd|rd|th)|First|Second|Third|Fourth|Fifth|Sixth)\s+Edition/i);
  if (editionMatch) {
    meta.edition = editionMatch[0].trim();
  }

  // Try to find Publisher (Copyright X, Published by X)
  const publisherMatch = text.match(/(?:Published by|Publisher|Copyright\s+(?:\(c\)|©)?\s*\d{4})\s+([A-Z][a-zA-Z0-9\s.,&]+)/i);
  if (publisherMatch) {
    // Clean up common noise
    let pub = publisherMatch[1].trim();
    pub = pub.replace(/All rights reserved.*/i, '').trim();
    if (pub.length < 50) {
        meta.publisher = pub;
    }
  }

  return meta;
};

// 2. Google Books API Lookup
const fetchGoogleBooksMetadata = async (title: string, authorHint?: string): Promise<Partial<PdfMetadata>> => {
  try {
    const query = `intitle:${encodeURIComponent(title)}${authorHint ? `+inauthor:${encodeURIComponent(authorHint)}` : ''}`;
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
    
    if (!response.ok) return {};

    const data = await response.json();
    if (data.items && data.items.length > 0) {
      const info = data.items[0].volumeInfo;
      
      const result: Partial<PdfMetadata> = {};
      
      if (info.authors && info.authors.length > 0) {
        result.author = info.authors.join(', ');
      }
      
      if (info.publisher) {
        result.publisher = info.publisher;
      }

      // Google Books often has high-res covers
      if (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail) {
         // Prefer HTTPS
         let img = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail;
         img = img.replace('http://', 'https://');
         result.coverUrl = img;
      }

      return result;
    }
  } catch (e) {
    console.warn("Google Books API lookup failed", e);
  }
  return {};
};


export const parsePdf = async (file: File): Promise<PdfParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let allChunks: TextChunk[] = [];
  let chunkIdCounter = 0;
  let firstPagesText = ''; // For heuristic analysis

  // 1. Process Text Page by Page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Naive reconstruction for extraction
    const pageTextRaw = textContent.items.map((item: any) => item.str).join(' ');
    
    // Collect first 3 pages for metadata analysis
    if (i <= 3) {
        firstPagesText += pageTextRaw + '\n';
    }

    const normalized = normalizeText(pageTextRaw);
    
    // Chunk this specific page
    const pageChunks = chunkPageText(normalized, i, chunkIdCounter);
    
    if (pageChunks.length > 0) {
      chunkIdCounter = pageChunks[pageChunks.length - 1].id + 1;
      allChunks = [...allChunks, ...pageChunks];
    }
  }

  // CHECK FOR SCANNED PDF
  if (allChunks.length === 0) {
    throw new Error('SCANNED_PDF_DETECTED');
  }

  // 2. Extract Outline (Table of Contents)
  let outline: PdfOutline[] = [];
  try {
    const rawOutline = await pdf.getOutline();
    if (rawOutline) {
      outline = await processOutline(pdf, rawOutline);
    }
  } catch (error) {
    console.error("Error reading outline:", error);
  }

  // 3. Extract Metadata (Multi-layered approach)
  let metadata: PdfMetadata = { 
    title: file.name.replace('.pdf', ''), 
    coverUrl: null 
  };

  try {
    // Layer 1: Internal PDF Metadata
    const meta = await pdf.getMetadata();
    if (meta?.info?.Title && meta.info.Title.trim() !== 'Untitled') {
      metadata.title = meta.info.Title;
    }
    if (meta?.info?.Author) {
      metadata.author = meta.info.Author;
    }
    
    // Generate local cover first (fallback)
    const localCover = await generateCoverImage(pdf);
    metadata.coverUrl = localCover;

    // Layer 2: Heuristics from Content
    const heuristicMeta = extractMetadataFromContent(firstPagesText);
    metadata = { ...metadata, ...heuristicMeta };

    // Layer 3: External API (Google Books)
    // Only fetch if we have a plausible title (longer than 3 chars)
    if (metadata.title && metadata.title.length > 3) {
       const googleMeta = await fetchGoogleBooksMetadata(metadata.title, metadata.author);
       
       // Merge strategies:
       // - Keep Title from PDF (usually most accurate to the file)
       // - Overwrite Author/Publisher if Google has them (usually cleaner)
       // - Use Google Cover if available (higher res), else keep local
       
       metadata = {
         ...metadata,
         author: googleMeta.author || metadata.author,
         publisher: googleMeta.publisher || metadata.publisher,
         coverUrl: googleMeta.coverUrl || metadata.coverUrl // Prefer Google cover
       };
    }

  } catch (error) {
    console.warn("Error reading metadata", error);
  }

  return { chunks: allChunks, outline, metadata };
};

export const modifyAndDownloadPDF = async (pdfData: ArrayBuffer, metadata: PdfMetadata) => {
  try {
    const pdfDoc = await PDFDocument.load(pdfData);
    
    if (metadata.title) pdfDoc.setTitle(metadata.title);
    if (metadata.author) pdfDoc.setAuthor(metadata.author);
    if (metadata.publisher) pdfDoc.setProducer(metadata.publisher); // Producer or Creator often used for publisher
    if (metadata.edition) pdfDoc.setSubject(`Edition: ${metadata.edition}`);

    const pdfBytes = await pdfDoc.save();
    
    // Create Blob and Download Link
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${metadata.title || 'document'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (e) {
    console.error("Error modifying PDF", e);
    alert("Failed to update PDF file. Downloading original.");
    
    // Fallback: Download original
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${metadata.title || 'document'}.pdf`;
    link.click();
  }
};