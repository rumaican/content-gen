declare module 'youtube-transcript-api' {
  export class YouTubeTranscriptApi {
    static listTranscript(videoId: string): Promise<TranscriptList>
    static getTranscript(videoId: string): Promise<TranscriptEntry[]>
  }

  export interface TranscriptList {
    findTranscript(langCodes?: string[]): Promise<Transcript>
    fetch(): Promise<TranscriptEntry[]>
  }

  export interface Transcript {
    transcript_id: string
    language: string
    language_code: string
    is_generated: boolean
    is_translatable: boolean
    events: TranscriptEvent[]
  }

  export interface TranscriptEntry {
    text: string
    start: number
    duration: number
  }

  export interface TranscriptEvent {
    utf8: string
    startMs: string
    durMs: string
  }
}
