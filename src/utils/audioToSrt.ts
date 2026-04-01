/**
 * Audio to SRT — converts Whisper word-level timestamps to SRT subtitle format.
 *
 * Whisper verbose_json returns word-level timestamps like:
 *   { word: "Hello", start: 0.5, end: 0.9 }
 *
 * SRT format:
 *   1
 *   00:00:00,500 --> 00:00:00,900
 *   Hello
 */

export interface WordTimestamp {
  word: string;
  start: number; // seconds (float)
  end: number;   // seconds (float)
}

/** Max duration per SRT entry in seconds */
const MAX_ENTRY_DURATION = 3.0;

/**
 * Format seconds as SRT timecode: HH:MM:SS,mmm
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Convert an array of Whisper word timestamps to an SRT string.
 *
 * Groups consecutive words into subtitle entries, capping each entry
 * at MAX_ENTRY_DURATION seconds to avoid excessively long subtitles.
 *
 * @param words - Array of word timestamps from Whisper verbose_json response
 * @returns SRT-formatted string
 */
export function wordsToSrt(words: WordTimestamp[]): string {
  if (!words || words.length === 0) return '';

  const entries: string[] = [];
  let index = 1;

  let i = 0;
  while (i < words.length) {
    const startWord = words[i];
    let endTime = startWord.end;
    const entryWords: string[] = [startWord.word];

    // Group words while the entry stays under MAX_ENTRY_DURATION
    let j = i + 1;
    while (j < words.length) {
      const candidate = words[j];
      if (candidate.start - startWord.start > MAX_ENTRY_DURATION) break;
      entryWords.push(candidate.word);
      endTime = candidate.end;
      j++;
    }

    const text = entryWords.join(' ');
    const startTimecode = formatTime(startWord.start);
    const endTimecode = formatTime(endTime);

    entries.push(`${index}\n${startTimecode} --> ${endTimecode}\n${text}`);
    index++;
    i = j;
  }

  return entries.join('\n\n') + '\n';
}
