# BMAD Analysis — TikTok Text Overlay Generator

## Card Summary
- **What:** Takes a TikTok video + SRT transcript → outputs MP4 with timed captions burned in using FFmpeg
- **Target:** TikTok-ready portrait 9:16 MP4 with readable animated captions

---

## Functional Requirements (from AC)

| # | Criterion | Implication |
|---|-----------|-------------|
| AC1 | Takes video + SRT → outputs MP4 with timed captions | Core flow: read SRT, apply drawtext overlay, write MP4 |
| AC2 | Portrait 9:16 format (1080x1920) | FFmpeg scale/crop or direct -vf scale=1080:1920 |
| AC3 | Text readable (contrast, size, positioning) | Style: white text, 2-3px black stroke, drop shadow, font size ≥24pt |
| AC4 | Completes in <2x video length | Streaming passthrough where possible; no re-encode of video stream unless needed |
| AC5 | Caption timing within 200ms accuracy | SRT timestamps used directly; no LLM re-timing of segments |

---

## Non-Functional Requirements

- **Progress events:** emit percentage via FFmpeg `-progress` flag
- **Error handling:** corrupt video, SRT format mismatch, FFmpeg crash, missing dependencies
- **TikTok-safe output:** H.264 video, AAC audio, 30fps, CRF 23, max 3min
- **Dependencies:** fluent-ffmpeg (already in package.json), openai (already in package.json)

---

## Solutioning — Edge Cases

### EC1: SRT timestamps don't match video duration
- If SRT end-time exceeds video duration, trim SRT entries past video end
- If SRT start-time is before 0, clamp to 0
- Validate SRT is parseable before running FFmpeg

### EC2: Video is not 9:16 portrait
- Scale + crop to fill 1080x1920 (center crop), or pad with blur background
- Default behavior: center-crop short edge, scale long edge to target
- Document as configurable `padStyle: 'crop' | 'blur'` in options

### EC3: Very long videos (>3min TikTok limit)
- Warn if video >180s; allow configurable `maxDuration`
- Hard cut at maxDuration if exceeds

### EC4: Missing FFmpeg binary
- Check `ffmpeg -version` on init; throw descriptive error if not found
- Provide install hint in error message

### EC5: Empty SRT (no captions)
- If SRT has 0 subtitle entries, output video unchanged (passthrough)
- Emit warning event

### EC6: Overlapping SRT entries
- SRT format can have overlapping timestamps; FFmpeg drawtext handles this natively

### EC7: Non-ASCII characters in SRT (Polish, etc.)
- Use UTF-8 encoding; FFmpeg drawtext supports UTF-8 with fontconfig
- Force font that supports Unicode (e.g., not Impact for non-ASCII — use bold sans-serif)

### EC8: Progress reporting
- FFmpeg `-progress` pipe output parsed line-by-line; emit `progress(0-100)` events

---

## Architecture

```
src/generators/tiktokTextOverlay.ts   ← main generator function
src/utils/ffmpegUtils.ts               ← FFmpeg wrapper, progress, error handling
```

Input types:
```ts
interface TikTokOverlayInput {
  videoPath: string;       // local MP4 path
  srtPath: string;         // SRT file from Whisper
  options?: {
    padStyle?: 'crop' | 'blur';  // how to handle non-9:16 video
    maxDuration?: number;        // seconds; default 180
    outputPath?: string;         // default: outputs/tiktok-captioned-{uuid}.mp4
  }
}
```

Output: `{ outputPath: string, duration: number }`
