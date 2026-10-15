# Fonts

Latin subsets of two variable fonts, both under the SIL Open Font License 1.1. `tokens.css` declares their `@font-face` rules.

| File | Family | Axes | License |
| --- | --- | --- | --- |
| `Archivo-Latin.woff2` | Archivo | weight 100 to 900 | [`Archivo-OFL.txt`](Archivo-OFL.txt), from [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo) |
| `Archivo-Italic-Latin.woff2` | Archivo Italic | weight 100 to 900 | [`Archivo-OFL.txt`](Archivo-OFL.txt) |
| `GeistMono-Latin.woff2` | Geist Mono | weight 400 to 600 | [`GeistMono-OFL.txt`](GeistMono-OFL.txt), from [vercel/geist-font](https://github.com/vercel/geist-font) |

`components/bundle.css` also loads Archivo's width axis (`font-stretch`, used by `eyebrow`) from Google Fonts.
