import { TextChunk, PdfOutline, PdfParseResult, PdfMetadata } from '../types';

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

export const parsePdf = async (file: File): Promise<PdfParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let allChunks: TextChunk[] = [];
  let chunkIdCounter = 0;

  // 1. Process Text Page by Page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Improved joining strategy:
    // If an item hasEOL, we add a newline. 
    // Otherwise we add a space to separate words, or nothing if it looks like a mid-word split.
    // For simplicity and robustness with most standard PDFs, joining with space is safer, 
    // but detecting EOL helps with paragraph reconstruction.
    
    let pageText = '';
    
    // Naive reconstruction: Join with space. 
    // A more advanced approach checks 'hasEOL' but PDF.js EOL detection varies by PDF generator.
    // We will stick to space joining but rely on 'normalizeText' to clean up artifacts.
    // To preserve paragraphs that actually exist in the structure (rare but helpful), we can check EOL.
    
    // Attempt to reconstruct lines
    let lastY = -1;
    const lines: string[] = [];
    let currentLine = '';

    for (const item of textContent.items) {
      if ('str' in item) {
        // Simple line detection based on Y transformation could be done here, 
        // but textContent.items usually come in reading order.
        // We just append with space.
        currentLine += item.str + (item.hasEOL ? '\n' : ' ');
      }
    }
    
    // Fallback if the loop above didn't use item.hasEOL property effectively (depends on PDF.js version/types)
    // The previous implementation used map().join(' '), which is robust for basic extraction.
    // We will revert to that but apply the enhanced normalization.
    pageText = textContent.items.map((item: any) => item.str).join(' ');

    const normalized = normalizeText(pageText);
    
    // Chunk this specific page
    const pageChunks = chunkPageText(normalized, i, chunkIdCounter);
    
    // Update counter for next page so IDs remain unique
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

  // 3. Extract Metadata & Cover
  let metadata: PdfMetadata = { title: file.name.replace('.pdf', ''), coverUrl: null };
  try {
    const meta = await pdf.getMetadata();
    if (meta?.info?.Title) {
      metadata.title = meta.info.Title;
    }
    const coverUrl = await generateCoverImage(pdf);
    metadata.coverUrl = coverUrl;
  } catch (error) {
    console.warn("Error reading metadata", error);
  }

  return { chunks: allChunks, outline, metadata };
};