export type VoiceOption = string; // Changed to string to support dynamic native voices

export interface AudioConfig {
  voice: VoiceOption;
  speed: number;
  useNative: boolean; // New flag for browser TTS
}

export interface TextChunk {
  id: number;
  text: string;
  pageNumber: number; // 1-based page number
}

export interface AudioCacheItem {
  blobUrl: string;
  isFetching: boolean;
}

export interface PdfOutline {
  title: string;
  pageNumber: number | null; // The target page number (1-based)
  items: PdfOutline[];
}

export interface PdfMetadata {
  title: string;
  coverUrl: string | null;
}

export interface PdfParseResult {
  chunks: TextChunk[];
  outline: PdfOutline[];
  metadata: PdfMetadata;
}