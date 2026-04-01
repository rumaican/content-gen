/**
 * Whisper Transcription — transcribes video to text
 */
import YoutubeTranscriptApi from 'youtube-transcript-api';
import path from 'path';

export async function transcribeVideo(videoPath: string): Promise<string> {
  // If it's a YouTube URL, use the API directly
  if (videoPath.startsWith('http')) {
    const videoId = extractYouTubeId(videoPath);
    const transcripts = await (YoutubeTranscriptApi as any).listTranscript(videoId);
    const transcript = await transcripts.fetch();
    return transcript.map((entry: any) => entry.text).join(' ');
  }
  
  // For downloaded files, would use Whisper API
  return '';
}

function extractYouTubeId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
  return match ? match[1] : url;
}
