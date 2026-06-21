Drop runtime sprite sheets in this folder.

Current runtime sheets should follow the `96 x 128` per-frame contract in
`SPRITE_PRODUCTION.md`. New clean sheets should use one row per action instead
of forcing every character into an `8 x 8` grid.

Generate or draw individual transparent PNG frames first, then pack them into a
single transparent PNG sheet. Do not generate visible grid lines, borders, labels,
or SVG strokes into final runtime art.

Each sheet should have a matching layout JSON under `art/sheets/<character>/`.
The older template sheet still matches:

- `art/sheets/template/template-mannequin-64.layout.json`

If a character sheet is missing, the renderer falls back to coloured placeholder
art for that character.
