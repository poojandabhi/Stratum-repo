# Stratum 2 — desktop image editor

Layered editing like Photoshop, plus a non-destructive, 16-bit Develop module like Lightroom.

## Run it
Double-click **Stratum.exe** in the `Stratum` folder. No installation needed.
Settings and presets are stored in `%APPDATA%\Stratum`.

## What's new in 2.0
- **Camera RAW**: CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF, SRW and more (LibRaw), decoded at 16 bits with camera white balance.
- **Develop panel**: white balance, exposure, contrast, highlights, shadows, whites, blacks, tone curve (RGB/R/G/B), clarity, dehaze, vibrance, saturation, B&W, color mixer (HSL, 8 bands), color grading, sharpening, noise reduction, vignette, grain, histogram, Auto, Before/After.
- **Copy / paste settings** (Ctrl+Shift+C / Ctrl+Shift+V), **Paste with strength** (Ctrl+Alt+Shift+V, 0–150%), **Previous** (Ctrl+Alt+V) and **Sync** (Ctrl+Alt+S) across open photos. Ctrl/Shift-click photos in the filmstrip to paste to many at once.
- **Presets**: built-in looks, your own presets, and **Lightroom .xmp import/export** (presets and sidecars).
- **Match Look**: copy the tones and colors of any reference photo (any format, including RAW) with Amount, Tone, Color, Saturation and Neutralize sliders.
- **Full-quality paste**: copy a photo *file* in Explorer and press Ctrl+V to paste the original file (even RAW) instead of a low-quality bitmap. **Paste Special** lets you pick placement, resampling (Lanczos-3/bilinear/nearest), whether to keep it as an editable photo layer, and whether to match the document's look.
- **Export** JPEG/PNG/WebP/TIFF with quality and Lanczos resizing; **Export All** batch-exports every open photo with its settings.
- **Projects** (.stratum) keep layers, 16-bit sources and develop settings.
- Multiple documents with tabs and a filmstrip, native file dialogs, unsaved-changes prompts, file drag-and-drop, open-with from Explorer.

## Build an installer (optional)
Needs Node.js 20+ on Windows:
```
npm install
npm run dist
```
This produces an NSIS installer and a portable exe in `dist\`.

## Credits
LibRaw (via libraw-wasm), UTIF.js, pako, IBM Plex / Anton / Caveat / Playfair Display fonts (OFL), Electron.
