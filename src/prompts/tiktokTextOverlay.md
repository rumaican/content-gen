# TikTok Text Overlay Generator — Usage Guide

## What It Does

The `addTextOverlay(videoPath, srtPath, options)` function takes a local video file and a Whisper-generated SRT transcript and produces a TikTok-ready portrait MP4 with timed captions burned into the video.

## When to Use

Call this generator when you have:
1. A downloaded video (from `downloadVideo` pipeline)
2. A Whisper SRT transcript (from `transcribeVideo` pipeline)

The output is a new MP4 file — the original is untouched.

## Function Signature

```ts
import { addTextOverlay } from './generators/index.js';

const result = await addTextOverlay('/path/to/video.mp4', '/path/to/transcript.srt', {
  padStyle: 'crop',     // 'crop' (default) | 'blur' (letterbox with blurred bg)
  maxDuration: 180,     // TikTok max 3 min; shorter is fine
  fontSize: 28,         // pixels at 1080x1920 output
  textColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 2,
  position: 'bottom',   // 'bottom' | 'top'
  onProgress: (pct) => console.log(`Progress: ${pct}%`),
});
// result.outputPath → '/absolute/path/to/outputs/tiktok-captioned-xxx.mp4'
// result.duration   → final duration in seconds
```

## Output Specs

| Property | Value |
|---|---|
| Resolution | 1080 × 1920 (9:16 portrait) |
| Codec | H.264 (libx264), CRF 23 |
| Framerate | 30 fps |
| Audio | AAC 128 kbps (copied from source) |
| Container | MP4 with faststart flag |
| Max duration | 180 s (configurable) |

## SRT Format

FFmpeg's `subtitles` filter reads standard SRT. The Whisper output from `transcribeVideo` produces compatible SRT.

Requirements:
- UTF-8 encoding
- Standard `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamp lines
- At least one subtitle entry

## Error Handling

| Error | Cause | Resolution |
|---|---|---|
| `FFmpeg is not installed` | ffmpeg binary missing | `brew install ffmpeg` |
| `Video file not found` | Wrong path | Check input path |
| `SRT file not found` | Wrong path | Check transcript path |
| `SRT file is empty` | Whisper returned nothing | Check transcription step |
| FFmpeg crash | Corrupt video / incompatible format | Check video codec; re-download |

## Pipeline Integration

```
yt-dlp download → Whisper transcribe → addTextOverlay → platforms/tiktok.js post
```
