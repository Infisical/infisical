# Icons

`icons.json` maps each of the 51 icon names to its SVG inner markup on a 24px grid. Wrap it as
`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">…</svg>`;
the ink is `currentColor`, so the icon takes the surrounding text color. The v4 `Icon` component is not yet implemented; its guidelines are in [`docs/components/icon.md`](../../docs/components/icon.md).

Sizes: 16px in controls, 18px in navigation and list media, 14px in small buttons. The `more` glyph carries its own 2.6 stroke.
