export type VoiceOption = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface AudioConfig {
  voice: VoiceOption;
  speed: number;
}

export interface TextChunk {
  id: number;
  text: string;
}

export interface AudioCacheItem {
  blobUrl: string;
  isFetching: boolean;
}