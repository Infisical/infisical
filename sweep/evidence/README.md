# SWEEP live-test evidence

Artifacts captured by `sweep/local/run.mjs` while reviewing this branch. Published so they resolve as
`raw.githubusercontent.com` URLs inside a GitHub review comment.

| File | Kind | What it shows |
| --- | --- | --- |
| `folder-rename-single-toast.mp4` | video | The behaviour: dialog open, colliding name entered, submit, **one** error toast. 16.9s, 10fps, 1440x900, H.264 |
| `folder-rename-single-toast.png` | image | The end state at full resolution: one toast, carrying the server's message |
| `folder-rename-dialog.png` | image | The Edit Folder dialog with a name that already exists, before submitting |

These disprove a finding SWEEP raised from static reading (a predicted duplicate toast). Only one toast
appears, so the finding was corrected rather than left standing.

## Which artifact for which defect

**Video for behaviour, image for appearance.** A duplicate toast, a value reverting on reopen, a button
that stays enabled — those are sequences, and a still cannot establish them. Misalignment, clipping, wrong
spacing, a broken empty state — those are single moments, and a video makes the reader scrub to find the
frame you already knew mattered.

**No GIFs.** Multi-megabyte for a few seconds, palette-quantised so text degrades, no seek or pause. The
`.mp4` here is 986KB at full resolution; the GIF it replaced was 1.7MB at 1000px and worse to read.

## Rendering constraints (tested against GitHub's own pipeline)

`![](x.png)` embeds inline. Video does **not** embed from an external host under any syntax: `<video>` is
stripped by the sanitiser, `![](x.mp4)` is rewritten to `<img>` and renders as broken alt text, blob view
reports `"image":false` with no player, and the raw URL serves `application/octet-stream` so it downloads.
Only GitHub's own attachment CDN produces a player, and its uploader needs a browser session — a `gh`
OAuth token gets 422.

So a behavioural finding **embeds a still frame as the inline anchor and links the `.mp4` beside it**. Drag
the file into the comment box by hand if a real player is worth it.

## Reproducing the encode

Playwright records `.webm`, and its bundled ffmpeg is a stripped build with only `png` and `libvpx`
encoders, so it cannot produce H.264. macOS AVFoundation can:

```bash
ffmpeg-mac -i in.webm -r 10 /tmp/frames/f%04d.png    # decode; -vf fps=10 fails, filter parser absent
swiftc -O sweep/frames-to-mp4.swift -o /tmp/frames-to-mp4
/tmp/frames-to-mp4 /tmp/frames out.mp4 10 2.5        # 10fps, hold the last frame 2.5s
```

Drop the leading page-load frames; a recording that opens on a spinner reads as a broken artifact.

Delete this directory before the branch is ever merged.
