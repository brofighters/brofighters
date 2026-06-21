# Sprite Production Contract

This is the sprite contract for Bro Fighters character sheets.

## Final Runtime Format

- Each animation frame is exactly `96 x 128` pixels.
- Use one row per action.
- Rows may have different numbers of real frames.
- The packed sheet width should match the longest row, with empty transparent cells at
  the end of shorter rows if needed.
- Runtime sheets should be transparent PNGs, not SVG mockups.
- The frame grid has no visible lines, gutters, labels, borders, or background colors.
- Each frame rectangle in character JSON is `[x, y, 96, 128]`.

## Per-Frame Generation

Generate or draw frames one by one first, then pack them into the 64-frame sheet.

Each individual source frame should be:

- `96 x 128` PNG with alpha transparency.
- Character facing right.
- Feet centered around `x = 48`.
- Ground contact / standing foot baseline around `y = 118`.
- At least `2 px` transparent padding from every canvas edge.
- No background, grid, border, guide marks, labels, watermark, shadows, or cell lines.

For AI generation, a larger temporary size is fine, but the cleaned final frame must be
normalized down to `96 x 128` before packing.

## Character Fit

Use these as practical bounds:

- Standing head top: roughly `y = 16-24`.
- Standing feet: roughly `y = 116-120`.
- Body center: roughly `x = 48`.
- Normal body width: roughly `x = 26-70`.
- Attacks and effects may extend wider, but must remain inside the `96 x 128` frame.

If a pose needs more room than this, shrink or reposition the pose inside the frame. Do
not change the frame size for one character or one animation.

## Row-Based Layout

For clean generated character sheets, prefer a row-based layout where each row is one
action, such as idle, walk, run, punch combo, block, hit, knockdown, and victory.

Keep a layout JSON next to each sheet that maps frame ids to `[x, y, 96, 128]`
rectangles. The layout JSON is the source of truth for frame names and coordinates.

The older 64-frame template layout still exists for compatibility, but new clean sheets
do not need to force that grid.

## No-Line Rules

The weird black/white lines usually come from visible grid strokes, SVG antialiasing,
background remnants, or packed frames bleeding into each other. Avoid them by following
these rules:

- Do not generate a whole sheet as one image.
- Do not ask the image model to draw a sprite-sheet grid.
- Do not include frame borders, dividing lines, labels, or guide marks in generated art.
- Do not use SVG strokes as final character art.
- Do not use chroma-key backgrounds for final frames if transparent PNG is available.
- Keep a clean alpha channel and transparent corners.
- Pack frames mechanically from clean individual PNGs.
- Use nearest-neighbor sampling when packing or previewing pixel/stylized frames.

## Recommended Workflow

1. Generate one pose/frame as a standalone transparent PNG.
2. Inspect it at game scale.
3. Normalize it to `96 x 128` with the feet and center aligned.
4. Repeat for all needed frames.
5. Pack the individual PNGs into the `768 x 1024` 64-frame sheet.
6. Verify the sheet against the layout JSON.
7. Point the character data at the packed PNG sheet.
