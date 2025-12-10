import { TextChunk, PdfOutline, PdfParseResult } from '../types';

declare const pdfjsLib: any;

const normalizeText = (text: string): string => {
  return text
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'ft')
    .replace(/\uFB06/g, 'st')
    .normalize('NFKC')
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
};

const chunkPageText = (text: string, pageNumber: number, startId: number): TextChunk[] => {
  const rawParagraphs = text.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];
  let idCounter = startId;
  const MAX_CHUNK_LENGTH = 1000;

  rawParagraphs.forEach((para) => {
    const cleanedPara = para.replace(/\s+/g, ' ').trim();
    if (cleanedPara.length === 0) return;

    if (cleanedPara.length <= MAX_CHUNK_LENGTH) {
      chunks.push({ id: idCounter++, text: cleanedPara, pageNumber });
    } else {
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

export const parsePdf = async (file: File): Promise<PdfParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let allChunks: TextChunk[] = [];
  let chunkIdCounter = 0;

  // 1. Process Text Page by Page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Join items with space, but keep logical blocks slightly separated
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
      
    const normalized = normalizeText(pageText);
    
    // Chunk this specific page
    const pageChunks = chunkPageText(normalized, i, chunkIdCounter);
    
    // Update counter for next page so IDs remain unique
    if (pageChunks.length > 0) {
      chunkIdCounter = pageChunks[pageChunks.length - 1].id + 1;
      allChunks = [...allChunks, ...pageChunks];
    }
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

  return { chunks: allChunks, outline };
};