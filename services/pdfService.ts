import { TextChunk } from '../types';

declare const pdfjsLib: any;

export const parsePdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n\n';
  }

  return fullText;
};

export const chunkText = (text: string): TextChunk[] => {
  // Split by double newlines (paragraphs) first
  const rawParagraphs = text.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];
  let idCounter = 0;

  const MAX_CHUNK_LENGTH = 1000; // OpenAI soft limit guidance for nice pacing

  rawParagraphs.forEach((para) => {
    const cleanedPara = para.replace(/\s+/g, ' ').trim();
    if (cleanedPara.length === 0) return;

    if (cleanedPara.length <= MAX_CHUNK_LENGTH) {
      chunks.push({ id: idCounter++, text: cleanedPara });
    } else {
      // If paragraph is too long, split by sentences
      const sentences = cleanedPara.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [cleanedPara];
      let currentSubChunk = '';

      sentences.forEach((sentence) => {
        if ((currentSubChunk + sentence).length > MAX_CHUNK_LENGTH) {
          if (currentSubChunk) {
            chunks.push({ id: idCounter++, text: currentSubChunk.trim() });
          }
          currentSubChunk = sentence;
        } else {
          currentSubChunk += sentence;
        }
      });

      if (currentSubChunk) {
        chunks.push({ id: idCounter++, text: currentSubChunk.trim() });
      }
    }
  });

  return chunks;
};