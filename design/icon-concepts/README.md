# Upster icon concepts

Four vector-first directions retain the tunnel and upward road, using rose
`#c8143f` and `#f0426a` as the palette anchors.

| Concept | Design idea | Foreground layers |
| --- | --- | --- |
| `portal-rise` | A front-facing tunnel and a straight road that becomes an upward arrow. | 2 |
| `rising-tube` | A diagonal capsule tunnel with a continuous road sweeping upward. | 3 |
| `cutout-gate` | A single rose silhouette with an upward road cut out of the tunnel. | 1 |
| `nested-rise` | Two tunnel arches create depth around an upward road on a rose background. | 3 |

Each concept contains:

- `background.svg`: full-bleed, unrounded 1024 x 1024 background with a simple gradient.
- Numbered foreground SVGs: transparent 1024 x 1024 canvases containing flat filled paths. Import in numerical order above the background in Apple Icon Composer.
- `icon.png`: flattened 1024 x 1024 preview with a rounded-square mask and a subtle surface wash. The mask and wash are not present in the source layers.
- `tray.svg`: black, transparent template glyph with an 18 x 18 viewBox. These are simplified separately for small menu bar sizes. The nested version drops the inner arch to keep its silhouette readable.
- `preview-32.png` and `preview-16.png`: actual downsampled app icon previews.
- `tray-18.png` and `tray-16.png`: actual-size template raster checks.

Foreground artwork stays inside the central 80% safe area. No source foreground
contains gradients, blur, highlights, shadows, text, or strokes. Tray paths use
black solely as the macOS template mask; the system supplies their display color.

Open `comparison.png` to compare the concepts and their small-size previews.
`cutout-gate` is the strongest minimal mark; `rising-tube` keeps the closest
relationship to the current diagonal pipe.

Regenerate with `python3 design/icon-concepts/render.py`. The script uses the
already installed `rsvg-convert` and Pillow, adds no repository dependencies,
and verifies dimensions, source layers, safe-area bounds, and tray colors.
