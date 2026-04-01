# PLAN — TikTok Text Overlay Generator

## Step 1: Create `src/utils/ffmpegUtils.ts`

A reusable FFmpeg wrapper with:
- `FfmpegCommand` extension via fluent-ffmpeg
- `withProgress(command, onProgress: (pct: number) => void)` — parses FFmpeg `-progress` pipe
- `withTimeout(command, seconds)` — kills process after timeout
- `ffmpegReady()` — checks `ffmpeg -version` availability

```ts
// Key exports
export function withProgress(cmd: ffmpeg.FfmpegCommand, cb: (pct: number) => void): ffmpeg.FfmpegCommand
export function withTimeout(cmd: ffmpeg.FfmpegCommand, seconds: number): ffmpeg.FfmpegCommand
export async function ffmpegReady(): Promise<boolean>
export function getVideoDuration(videoPath: string): Promise<number>
```

## Step 2: Create `src/generators/tiktokTextOverlay.ts`

```ts
export interface TikTokOverlayOptions {
  padStyle?: 'crop' | 'blur';   // default: 'crop'
  maxDuration?: number;          // default: 180
  outputPath?: string;           // default: auto-generated in outputs/
  fontFamily?: string;           // default: 'sans-serif' (Impact not reliable for unicode)
  fontSize?: number;             // default: 28
  textColor?: string;            // default: 'white' (#FFFFFF)
  strokeColor?: string;          // default: 'black'
  strokeWidth?: number;          // default: 2
  position?: 'bottom' | 'top';   // default: 'bottom'
}

export interface TikTokOverlayResult {
  outputPath: string;
  duration: number;
}

export function addTextOverlay(
  videoPath: string,
  srtPath: string,
  options?: TikTokOverlayOptions
): Promise<TikTokOverlayResult>
```

### Internal Flow

1. **Validate FFmpeg** — call `ffmpegReady()`, throw if unavailable
2. **Parse SRT** — read file, validate format, count entries; warn if 0 entries
3. **Get video duration** — via `getVideoDuration()`; compare to SRT max timestamp; clamp/correct if mismatch
4. **Build FFmpeg filter chain:**
   - Input: video + SRT file
   - Scale/crop to 1080x1920 based on `padStyle`
   - `subtitles` filter using the SRT file with `force_style`
   - Output settings: H.264, CRF 23, 30fps, AAC audio copy
5. **Execute with progress** — pipe through `withProgress`, emit events
6. **Return result** — output path and final duration

### FFmpeg Filter Detail

**Crop (default — fills 9:16 by cropping sides):**
```
-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
```

**Blur pad (adds blurred background for landscape video):**
```
-vf "scale=1080:1920:force_original_aspect_ratio=increase,boxblur=5[blurred];[in][blurred]overlay=(W-w)/2:(H-h)/2"
```
(Actually use pad filter for clean letterbox: `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black`)

**Subtitles styling (force_style):**
```
subtitles={srtPath}:force_style='FontSize=28,PrimaryColour=&H00FFFFFF,Outline=2,OutlineColour=&H00000000,Bold=1,MarginV=40'
```

## Step 3: Create `src/generators/index.ts` export

```ts
export { addTextOverlay, TikTokOverlayOptions, TikTokOverlayResult } from './tiktokTextOverlay.js'
```

## Step 4: Create `src/prompts/tiktokTextOverlay.md`

System prompt fragment describing how to use the generator for downstream LLM calls (not needed for the generator itself, but for context when an LLM decides to call this tool).

## Step 5: Add Tests

Using vitest (already in devDependencies):

- `test/tiktokTextOverlay.test.ts`:
  - Mock FFmpeg binary behavior
  - Test SRT validation (valid, empty, malformed)
  - Test padStyle options produce different filter strings
  - Test duration clamping

## File Map

```
src/
  generators/
    tiktokTextOverlay.ts   ← new
    index.ts               ← update (add export)
  utils/
    ffmpegUtils.ts         ← new
test/
  tiktokTextOverlay.test.ts  ← new
src/prompts/
  tiktokTextOverlay.md       ← new
BMAD_ANALYSIS.md             ← already written
PLAN.md                      ← this file
```

## Verification Checklist

- [ ] `src/utils/ffmpegUtils.ts` compiles with TypeScript
- [ ] `src/generators/tiktokTextOverlay.ts` exports `addTextOverlay`
- [ ] SRT empty → passthrough with warning
- [ ] SRT malformed → throws descriptive error
- [ ] Non-9:16 video → crop or pad based on option
- [ ] Progress events emitted (0–100)
- [ ] Output is 1080x1920 H.264 MP4 at 30fps
- [ ] Tests pass with `npm test`
