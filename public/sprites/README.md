Drop runtime sprite sheets in this folder.

The first expected sheet is:

- `yap-sheet-v1.svg` for the current draft mockup
- `yap-sheet-v1.png` for the final pixel-art export

It should match the export contract in `SPRITE_PRODUCTION.md` and the coordinates in:

- `art/sheets/yap/yap-sheet-v1.layout.json`
- `art/sheets/yap/yap-sheet-v1-guide.svg`
- `scripts/generate_yap_sprite_mockup.mjs`

If the file is missing, the game falls back to Yap's portrait trial art.
