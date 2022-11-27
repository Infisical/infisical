const colors = require("tailwindcss/colors");
const round = (num) =>
  num
    .toFixed(7)
    .replace(/(\.[0-9]+?)0+$/, "$1")
    .replace(/\.0$/, "");
const rem = (px) => `${round(px / 16)}rem`;
const em = (px, base) => `${round(px / base)}em`;

let defaultModifiers = {
  sm: {
    css: [
      {
        fontSize: rem(14),
        lineHeight: round(24 / 14),
        p: {
          marginTop: em(16, 14),
          marginBottom: em(16, 14),
        },
        '[class~="lead"]': {
          fontSize: em(18, 14),
          lineHeight: round(28 / 18),
          marginTop: em(16, 18),
          marginBottom: em(16, 18),
        },
        blockquote: {
          marginTop: em(24, 18),
          marginBottom: em(24, 18),
          paddingLeft: em(20, 18),
        },
        h1: {
          fontSize: em(30, 14),
          marginTop: "0",
          marginBottom: em(24, 30),
          lineHeight: round(36 / 30),
        },
        h2: {
          fontSize: em(20, 14),
          marginTop: em(32, 20),
          marginBottom: em(16, 20),
          lineHeight: round(28 / 20),
        },
        h3: {
          fontSize: em(18, 14),
          marginTop: em(28, 18),
          marginBottom: em(8, 18),
          lineHeight: round(28 / 18),
        },
        h4: {
          marginTop: em(20, 14),
          marginBottom: em(8, 14),
          lineHeight: round(20 / 14),
        },
        img: {
          marginTop: em(24, 14),
          marginBottom: em(24, 14),
        },
        video: {
          marginTop: em(24, 14),
          marginBottom: em(24, 14),
        },
        figure: {
          marginTop: em(24, 14),
          marginBottom: em(24, 14),
        },
        "figure > *": {
          marginTop: "0",
          marginBottom: "0",
        },
        figcaption: {
          fontSize: em(12, 14),
          lineHeight: round(16 / 12),
          marginTop: em(8, 12),
        },
        code: {
          fontSize: em(12, 14),
        },
        "h2 code": {
          fontSize: em(18, 20),
        },
        "h3 code": {
          fontSize: em(16, 18),
        },
        pre: {
          fontSize: em(12, 14),
          lineHeight: round(20 / 12),
          marginTop: em(20, 12),
          marginBottom: em(20, 12),
          borderRadius: rem(4),
          paddingTop: em(8, 12),
          paddingRight: em(12, 12),
          paddingBottom: em(8, 12),
          paddingLeft: em(12, 12),
        },
        ol: {
          marginTop: em(16, 14),
          marginBottom: em(16, 14),
          paddingLeft: em(22, 14),
        },
        ul: {
          marginTop: em(16, 14),
          marginBottom: em(16, 14),
          paddingLeft: em(22, 14),
        },
        li: {
          marginTop: em(4, 14),
          marginBottom: em(4, 14),
        },
        "ol > li": {
          paddingLeft: em(6, 14),
        },
        "ul > li": {
          paddingLeft: em(6, 14),
        },
        "> ul > li p": {
          marginTop: em(8, 14),
          marginBottom: em(8, 14),
        },
        "> ul > li > *:first-child": {
          marginTop: em(16, 14),
        },
        "> ul > li > *:last-child": {
          marginBottom: em(16, 14),
        },
        "> ol > li > *:first-child": {
          marginTop: em(16, 14),
        },
        "> ol > li > *:last-child": {
          marginBottom: em(16, 14),
        },
        "ul ul, ul ol, ol ul, ol ol": {
          marginTop: em(8, 14),
          marginBottom: em(8, 14),
        },
        hr: {
          marginTop: em(40, 14),
          marginBottom: em(40, 14),
        },
        "hr + *": {
          marginTop: "0",
        },
        "h2 + *": {
          marginTop: "0",
        },
        "h3 + *": {
          marginTop: "0",
        },
        "h4 + *": {
          marginTop: "0",
        },
        table: {
          fontSize: em(12, 14),
          lineHeight: round(18 / 12),
        },
        "thead th": {
          paddingRight: em(12, 12),
          paddingBottom: em(8, 12),
          paddingLeft: em(12, 12),
        },
        "thead th:first-child": {
          paddingLeft: "0",
        },
        "thead th:last-child": {
          paddingRight: "0",
        },
        "tbody td, tfoot td": {
          paddingTop: em(8, 12),
          paddingRight: em(12, 12),
          paddingBottom: em(8, 12),
          paddingLeft: em(12, 12),
        },
        "tbody td:first-child, tfoot td:first-child": {
          paddingLeft: "0",
        },
        "tbody td:last-child, tfoot td:last-child": {
          paddingRight: "0",
        },
      },
      {
        "> :first-child": {
          marginTop: "0",
        },
        "> :last-child": {
          marginBottom: "0",
        },
      },
    ],
  },
  base: {
    css: [
      {
        fontSize: rem(16),
        lineHeight: round(28 / 16),
        p: {
          marginTop: em(20, 16),
          marginBottom: em(20, 16),
        },
        '[class~="lead"]': {
          fontSize: em(20, 16),
          lineHeight: round(32 / 20),
          marginTop: em(24, 20),
          marginBottom: em(24, 20),
        },
        blockquote: {
          marginTop: em(32, 20),
          marginBottom: em(32, 20),
          paddingLeft: em(20, 20),
        },
        h1: {
          fontSize: em(36, 16),
          marginTop: "0",
          marginBottom: em(32, 36),
          lineHeight: round(40 / 36),
        },
        h2: {
          fontSize: em(24, 16),
          marginTop: em(48, 24),
          marginBottom: em(24, 24),
          lineHeight: round(32 / 24),
        },
        h3: {
          fontSize: em(20, 16),
          marginTop: em(32, 20),
          marginBottom: em(12, 20),
          lineHeight: round(32 / 20),
        },
        h4: {
          marginTop: em(24, 16),
          marginBottom: em(8, 16),
          lineHeight: round(24 / 16),
        },
        img: {
          marginTop: em(32, 16),
          marginBottom: em(32, 16),
        },
        video: {
          marginTop: em(32, 16),
          marginBottom: em(32, 16),
        },
        figure: {
          marginTop: em(32, 16),
          marginBottom: em(32, 16),
        },
        "figure > *": {
          marginTop: "0",
          marginBottom: "0",
        },
        figcaption: {
          fontSize: em(14, 16),
          lineHeight: round(20 / 14),
          marginTop: em(12, 14),
        },
        code: {
          fontSize: em(14, 16),
        },
        "h2 code": {
          fontSize: em(21, 24),
        },
        "h3 code": {
          fontSize: em(18, 20),
        },
        pre: {
          fontSize: em(14, 16),
          lineHeight: round(24 / 14),
          marginTop: em(24, 14),
          marginBottom: em(24, 14),
          borderRadius: rem(6),
          paddingTop: em(12, 14),
          paddingRight: em(16, 14),
          paddingBottom: em(12, 14),
          paddingLeft: em(16, 14),
        },
        ol: {
          marginTop: em(20, 16),
          marginBottom: em(20, 16),
          paddingLeft: em(26, 16),
        },
        ul: {
          marginTop: em(20, 16),
          marginBottom: em(20, 16),
          paddingLeft: em(26, 16),
        },
        li: {
          marginTop: em(8, 16),
          marginBottom: em(8, 16),
        },
        "ol > li": {
          paddingLeft: em(6, 16),
        },
        "ul > li": {
          paddingLeft: em(6, 16),
        },
        "> ul > li p": {
          marginTop: em(12, 16),
          marginBottom: em(12, 16),
        },
        "> ul > li > *:first-child": {
          marginTop: em(20, 16),
        },
        "> ul > li > *:last-child": {
          marginBottom: em(20, 16),
        },
        "> ol > li > *:first-child": {
          marginTop: em(20, 16),
        },
        "> ol > li > *:last-child": {
          marginBottom: em(20, 16),
        },
        "ul ul, ul ol, ol ul, ol ol": {
          marginTop: em(12, 16),
          marginBottom: em(12, 16),
        },
        hr: {
          marginTop: em(48, 16),
          marginBottom: em(48, 16),
        },
        "hr + *": {
          marginTop: "0",
        },
        "h2 + *": {
          marginTop: "0",
        },
        "h3 + *": {
          marginTop: "0",
        },
        "h4 + *": {
          marginTop: "0",
        },
        table: {
          fontSize: em(14, 16),
          lineHeight: round(24 / 14),
        },
        "thead th": {
          paddingRight: em(8, 14),
          paddingBottom: em(8, 14),
          paddingLeft: em(8, 14),
        },
        "thead th:first-child": {
          paddingLeft: "0",
        },
        "thead th:last-child": {
          paddingRight: "0",
        },
        "tbody td, tfoot td": {
          paddingTop: em(8, 14),
          paddingRight: em(8, 14),
          paddingBottom: em(8, 14),
          paddingLeft: em(8, 14),
        },
        "tbody td:first-child, tfoot td:first-child": {
          paddingLeft: "0",
        },
        "tbody td:last-child, tfoot td:last-child": {
          paddingRight: "0",
        },
      },
      {
        "> :first-child": {
          marginTop: "0",
        },
        "> :last-child": {
          marginBottom: "0",
        },
      },
    ],
  },
  lg: {
    css: [
      {
        fontSize: rem(18),
        lineHeight: round(32 / 18),
        p: {
          marginTop: em(24, 18),
          marginBottom: em(24, 18),
        },
        '[class~="lead"]': {
          fontSize: em(22, 18),
          lineHeight: round(32 / 22),
          marginTop: em(24, 22),
          marginBottom: em(24, 22),
        },
        blockquote: {
          marginTop: em(40, 24),
          marginBottom: em(40, 24),
          paddingLeft: em(24, 24),
        },
        h1: {
          fontSize: em(48, 18),
          marginTop: "0",
          marginBottom: em(40, 48),
          lineHeight: round(48 / 48),
        },
        h2: {
          fontSize: em(30, 18),
          marginTop: em(56, 30),
          marginBottom: em(32, 30),
          lineHeight: round(40 / 30),
        },
        h3: {
          fontSize: em(24, 18),
          marginTop: em(40, 24),
          marginBottom: em(16, 24),
          lineHeight: round(36 / 24),
        },
        h4: {
          marginTop: em(32, 18),
          marginBottom: em(8, 18),
          lineHeight: round(28 / 18),
        },
        img: {
          marginTop: em(32, 18),
          marginBottom: em(32, 18),
        },
        video: {
          marginTop: em(32, 18),
          marginBottom: em(32, 18),
        },
        figure: {
          marginTop: em(32, 18),
          marginBottom: em(32, 18),
        },
        "figure > *": {
          marginTop: "0",
          marginBottom: "0",
        },
        figcaption: {
          fontSize: em(16, 18),
          lineHeight: round(24 / 16),
          marginTop: em(16, 16),
        },
        code: {
          fontSize: em(16, 18),
        },
        "h2 code": {
          fontSize: em(26, 30),
        },
        "h3 code": {
          fontSize: em(21, 24),
        },
        pre: {
          fontSize: em(16, 18),
          lineHeight: round(28 / 16),
          marginTop: em(32, 16),
          marginBottom: em(32, 16),
          borderRadius: rem(6),
          paddingTop: em(16, 16),
          paddingRight: em(24, 16),
          paddingBottom: em(16, 16),
          paddingLeft: em(24, 16),
        },
        ol: {
          marginTop: em(24, 18),
          marginBottom: em(24, 18),
          paddingLeft: em(28, 18),
        },
        ul: {
          marginTop: em(24, 18),
          marginBottom: em(24, 18),
          paddingLeft: em(28, 18),
        },
        li: {
          marginTop: em(12, 18),
          marginBottom: em(12, 18),
        },
        "ol > li": {
          paddingLeft: em(8, 18),
        },
        "ul > li": {
          paddingLeft: em(8, 18),
        },
        "> ul > li p": {
          marginTop: em(16, 18),
          marginBottom: em(16, 18),
        },
        "> ul > li > *:first-child": {
          marginTop: em(24, 18),
        },
        "> ul > li > *:last-child": {
          marginBottom: em(24, 18),
        },
        "> ol > li > *:first-child": {
          marginTop: em(24, 18),
        },
        "> ol > li > *:last-child": {
          marginBottom: em(24, 18),
        },
        "ul ul, ul ol, ol ul, ol ol": {
          marginTop: em(16, 18),
          marginBottom: em(16, 18),
        },
        hr: {
          marginTop: em(56, 18),
          marginBottom: em(56, 18),
        },
        "hr + *": {
          marginTop: "0",
        },
        "h2 + *": {
          marginTop: "0",
        },
        "h3 + *": {
          marginTop: "0",
        },
        "h4 + *": {
          marginTop: "0",
        },
        table: {
          fontSize: em(16, 18),
          lineHeight: round(24 / 16),
        },
        "thead th": {
          paddingRight: em(12, 16),
          paddingBottom: em(12, 16),
          paddingLeft: em(12, 16),
        },
        "thead th:first-child": {
          paddingLeft: "0",
        },
        "thead th:last-child": {
          paddingRight: "0",
        },
        "tbody td, tfoot td": {
          paddingTop: em(12, 16),
          paddingRight: em(12, 16),
          paddingBottom: em(12, 16),
          paddingLeft: em(12, 16),
        },
        "tbody td:first-child, tfoot td:first-child": {
          paddingLeft: "0",
        },
        "tbody td:last-child, tfoot td:last-child": {
          paddingRight: "0",
        },
      },
      {
        "> :first-child": {
          marginTop: "0",
        },
        "> :last-child": {
          marginBottom: "0",
        },
      },
    ],
  },
  xl: {
    css: [
      {
        fontSize: rem(20),
        lineHeight: round(36 / 20),
        p: {
          marginTop: em(24, 20),
          marginBottom: em(24, 20),
        },
        '[class~="lead"]': {
          fontSize: em(24, 20),
          lineHeight: round(36 / 24),
          marginTop: em(24, 24),
          marginBottom: em(24, 24),
        },
        blockquote: {
          marginTop: em(48, 30),
          marginBottom: em(48, 30),
          paddingLeft: em(32, 30),
        },
        h1: {
          fontSize: em(56, 20),
          marginTop: "0",
          marginBottom: em(48, 56),
          lineHeight: round(56 / 56),
        },
        h2: {
          fontSize: em(36, 20),
          marginTop: em(56, 36),
          marginBottom: em(32, 36),
          lineHeight: round(40 / 36),
        },
        h3: {
          fontSize: em(30, 20),
          marginTop: em(48, 30),
          marginBottom: em(20, 30),
          lineHeight: round(40 / 30),
        },
        h4: {
          marginTop: em(36, 20),
          marginBottom: em(12, 20),
          lineHeight: round(32 / 20),
        },
        img: {
          marginTop: em(40, 20),
          marginBottom: em(40, 20),
        },
        video: {
          marginTop: em(40, 20),
          marginBottom: em(40, 20),
        },
        figure: {
          marginTop: em(40, 20),
          marginBottom: em(40, 20),
        },
        "figure > *": {
          marginTop: "0",
          marginBottom: "0",
        },
        figcaption: {
          fontSize: em(18, 20),
          lineHeight: round(28 / 18),
          marginTop: em(18, 18),
        },
        code: {
          fontSize: em(18, 20),
        },
        "h2 code": {
          fontSize: em(31, 36),
        },
        "h3 code": {
          fontSize: em(27, 30),
        },
        pre: {
          fontSize: em(18, 20),
          lineHeight: round(32 / 18),
          marginTop: em(36, 18),
          marginBottom: em(36, 18),
          borderRadius: rem(8),
          paddingTop: em(20, 18),
          paddingRight: em(24, 18),
          paddingBottom: em(20, 18),
          paddingLeft: em(24, 18),
        },
        ol: {
          marginTop: em(24, 20),
          marginBottom: em(24, 20),
          paddingLeft: em(32, 20),
        },
        ul: {
          marginTop: em(24, 20),
          marginBottom: em(24, 20),
          paddingLeft: em(32, 20),
        },
        li: {
          marginTop: em(12, 20),
          marginBottom: em(12, 20),
        },
        "ol > li": {
          paddingLeft: em(8, 20),
        },
        "ul > li": {
          paddingLeft: em(8, 20),
        },
        "> ul > li p": {
          marginTop: em(16, 20),
          marginBottom: em(16, 20),
        },
        "> ul > li > *:first-child": {
          marginTop: em(24, 20),
        },
        "> ul > li > *:last-child": {
          marginBottom: em(24, 20),
        },
        "> ol > li > *:first-child": {
          marginTop: em(24, 20),
        },
        "> ol > li > *:last-child": {
          marginBottom: em(24, 20),
        },
        "ul ul, ul ol, ol ul, ol ol": {
          marginTop: em(16, 20),
          marginBottom: em(16, 20),
        },
        hr: {
          marginTop: em(56, 20),
          marginBottom: em(56, 20),
        },
        "hr + *": {
          marginTop: "0",
        },
        "h2 + *": {
          marginTop: "0",
        },
        "h3 + *": {
          marginTop: "0",
        },
        "h4 + *": {
          marginTop: "0",
        },
        table: {
          fontSize: em(18, 20),
          lineHeight: round(28 / 18),
        },
        "thead th": {
          paddingRight: em(12, 18),
          paddingBottom: em(16, 18),
          paddingLeft: em(12, 18),
        },
        "thead th:first-child": {
          paddingLeft: "0",
        },
        "thead th:last-child": {
          paddingRight: "0",
        },
        "tbody td, tfoot td": {
          paddingTop: em(16, 18),
          paddingRight: em(12, 18),
          paddingBottom: em(16, 18),
          paddingLeft: em(12, 18),
        },
        "tbody td:first-child, tfoot td:first-child": {
          paddingLeft: "0",
        },
        "tbody td:last-child, tfoot td:last-child": {
          paddingRight: "0",
        },
      },
      {
        "> :first-child": {
          marginTop: "0",
        },
        "> :last-child": {
          marginBottom: "0",
        },
      },
    ],
  },
  "2xl": {
    css: [
      {
        fontSize: rem(24),
        lineHeight: round(40 / 24),
        p: {
          marginTop: em(32, 24),
          marginBottom: em(32, 24),
        },
        '[class~="lead"]': {
          fontSize: em(30, 24),
          lineHeight: round(44 / 30),
          marginTop: em(32, 30),
          marginBottom: em(32, 30),
        },
        blockquote: {
          marginTop: em(64, 36),
          marginBottom: em(64, 36),
          paddingLeft: em(40, 36),
        },
        h1: {
          fontSize: em(64, 24),
          marginTop: "0",
          marginBottom: em(56, 64),
          lineHeight: round(64 / 64),
        },
        h2: {
          fontSize: em(48, 24),
          marginTop: em(72, 48),
          marginBottom: em(40, 48),
          lineHeight: round(52 / 48),
        },
        h3: {
          fontSize: em(36, 24),
          marginTop: em(56, 36),
          marginBottom: em(24, 36),
          lineHeight: round(44 / 36),
        },
        h4: {
          marginTop: em(40, 24),
          marginBottom: em(16, 24),
          lineHeight: round(36 / 24),
        },
        img: {
          marginTop: em(48, 24),
          marginBottom: em(48, 24),
        },
        video: {
          marginTop: em(48, 24),
          marginBottom: em(48, 24),
        },
        figure: {
          marginTop: em(48, 24),
          marginBottom: em(48, 24),
        },
        "figure > *": {
          marginTop: "0",
          marginBottom: "0",
        },
        figcaption: {
          fontSize: em(20, 24),
          lineHeight: round(32 / 20),
          marginTop: em(20, 20),
        },
        code: {
          fontSize: em(20, 24),
        },
        "h2 code": {
          fontSize: em(42, 48),
        },
        "h3 code": {
          fontSize: em(32, 36),
        },
        pre: {
          fontSize: em(20, 24),
          lineHeight: round(36 / 20),
          marginTop: em(40, 20),
          marginBottom: em(40, 20),
          borderRadius: rem(8),
          paddingTop: em(24, 20),
          paddingRight: em(32, 20),
          paddingBottom: em(24, 20),
          paddingLeft: em(32, 20),
        },
        ol: {
          marginTop: em(32, 24),
          marginBottom: em(32, 24),
          paddingLeft: em(38, 24),
        },
        ul: {
          marginTop: em(32, 24),
          marginBottom: em(32, 24),
          paddingLeft: em(38, 24),
        },
        li: {
          marginTop: em(12, 24),
          marginBottom: em(12, 24),
        },
        "ol > li": {
          paddingLeft: em(10, 24),
        },
        "ul > li": {
          paddingLeft: em(10, 24),
        },
        "> ul > li p": {
          marginTop: em(20, 24),
          marginBottom: em(20, 24),
        },
        "> ul > li > *:first-child": {
          marginTop: em(32, 24),
        },
        "> ul > li > *:last-child": {
          marginBottom: em(32, 24),
        },
        "> ol > li > *:first-child": {
          marginTop: em(32, 24),
        },
        "> ol > li > *:last-child": {
          marginBottom: em(32, 24),
        },
        "ul ul, ul ol, ol ul, ol ol": {
          marginTop: em(16, 24),
          marginBottom: em(16, 24),
        },
        hr: {
          marginTop: em(72, 24),
          marginBottom: em(72, 24),
        },
        "hr + *": {
          marginTop: "0",
        },
        "h2 + *": {
          marginTop: "0",
        },
        "h3 + *": {
          marginTop: "0",
        },
        "h4 + *": {
          marginTop: "0",
        },
        table: {
          fontSize: em(20, 24),
          lineHeight: round(28 / 20),
        },
        "thead th": {
          paddingRight: em(12, 20),
          paddingBottom: em(16, 20),
          paddingLeft: em(12, 20),
        },
        "thead th:first-child": {
          paddingLeft: "0",
        },
        "thead th:last-child": {
          paddingRight: "0",
        },
        "tbody td, tfoot td": {
          paddingTop: em(16, 20),
          paddingRight: em(12, 20),
          paddingBottom: em(16, 20),
          paddingLeft: em(12, 20),
        },
        "tbody td:first-child, tfoot td:first-child": {
          paddingLeft: "0",
        },
        "tbody td:last-child, tfoot td:last-child": {
          paddingRight: "0",
        },
      },
      {
        "> :first-child": {
          marginTop: "0",
        },
        "> :last-child": {
          marginBottom: "0",
        },
      },
    ],
  },

  // Invert (for dark mode)
  invert: {
    css: {
      "--tw-prose-body": "var(--tw-prose-invert-body)",
      "--tw-prose-headings": "var(--tw-prose-invert-headings)",
      "--tw-prose-lead": "var(--tw-prose-invert-lead)",
      "--tw-prose-links": "var(--tw-prose-invert-links)",
      "--tw-prose-bold": "var(--tw-prose-invert-bold)",
      "--tw-prose-counters": "var(--tw-prose-invert-counters)",
      "--tw-prose-bullets": "var(--tw-prose-invert-bullets)",
      "--tw-prose-hr": "var(--tw-prose-invert-hr)",
      "--tw-prose-quotes": "var(--tw-prose-invert-quotes)",
      "--tw-prose-quote-borders": "var(--tw-prose-invert-quote-borders)",
      "--tw-prose-captions": "var(--tw-prose-invert-captions)",
      "--tw-prose-code": "var(--tw-prose-invert-code)",
      "--tw-prose-pre-code": "var(--tw-prose-invert-pre-code)",
      "--tw-prose-pre-bg": "var(--tw-prose-invert-pre-bg)",
      "--tw-prose-th-borders": "var(--tw-prose-invert-th-borders)",
      "--tw-prose-td-borders": "var(--tw-prose-invert-td-borders)",
    },
  },

  // Gray color themes

  slate: {
    css: {
      "--tw-prose-body": colors.slate[700],
      "--tw-prose-headings": colors.slate[900],
      "--tw-prose-lead": colors.slate[600],
      "--tw-prose-links": colors.slate[900],
      "--tw-prose-bold": colors.slate[900],
      "--tw-prose-counters": colors.slate[500],
      "--tw-prose-bullets": colors.slate[300],
      "--tw-prose-hr": colors.slate[200],
      "--tw-prose-quotes": colors.slate[900],
      "--tw-prose-quote-borders": colors.slate[200],
      "--tw-prose-captions": colors.slate[500],
      "--tw-prose-code": colors.slate[900],
      "--tw-prose-pre-code": colors.slate[200],
      "--tw-prose-pre-bg": colors.slate[800],
      "--tw-prose-th-borders": colors.slate[300],
      "--tw-prose-td-borders": colors.slate[200],
      "--tw-prose-invert-body": colors.slate[300],
      "--tw-prose-invert-headings": colors.white,
      "--tw-prose-invert-lead": colors.slate[400],
      "--tw-prose-invert-links": colors.white,
      "--tw-prose-invert-bold": colors.white,
      "--tw-prose-invert-counters": colors.slate[400],
      "--tw-prose-invert-bullets": colors.slate[600],
      "--tw-prose-invert-hr": colors.slate[700],
      "--tw-prose-invert-quotes": colors.slate[100],
      "--tw-prose-invert-quote-borders": colors.slate[700],
      "--tw-prose-invert-captions": colors.slate[400],
      "--tw-prose-invert-code": colors.white,
      "--tw-prose-invert-pre-code": colors.slate[300],
      "--tw-prose-invert-pre-bg": "rgb(0 0 0 / 50%)",
      "--tw-prose-invert-th-borders": colors.slate[600],
      "--tw-prose-invert-td-borders": colors.slate[700],
    },
  },

  gray: {
    css: {
      "--tw-prose-body": colors.gray[700],
      "--tw-prose-headings": colors.gray[900],
      "--tw-prose-lead": colors.gray[600],
      "--tw-prose-links": colors.gray[900],
      "--tw-prose-bold": colors.gray[900],
      "--tw-prose-counters": colors.gray[500],
      "--tw-prose-bullets": colors.gray[300],
      "--tw-prose-hr": colors.gray[200],
      "--tw-prose-quotes": colors.gray[900],
      "--tw-prose-quote-borders": colors.gray[200],
      "--tw-prose-captions": colors.gray[500],
      "--tw-prose-code": colors.gray[900],
      "--tw-prose-pre-code": colors.gray[200],
      "--tw-prose-pre-bg": colors.gray[800],
      "--tw-prose-th-borders": colors.gray[300],
      "--tw-prose-td-borders": colors.gray[200],
      "--tw-prose-invert-body": colors.gray[300],
      "--tw-prose-invert-headings": colors.white,
      "--tw-prose-invert-lead": colors.gray[400],
      "--tw-prose-invert-links": colors.white,
      "--tw-prose-invert-bold": colors.white,
      "--tw-prose-invert-counters": colors.gray[400],
      "--tw-prose-invert-bullets": colors.gray[600],
      "--tw-prose-invert-hr": colors.gray[700],
      "--tw-prose-invert-quotes": colors.gray[100],
      "--tw-prose-invert-quote-borders": colors.gray[700],
      "--tw-prose-invert-captions": colors.gray[400],
      "--tw-prose-invert-code": colors.white,
      "--tw-prose-invert-pre-code": colors.gray[300],
      "--tw-prose-invert-pre-bg": "rgb(0 0 0 / 50%)",
      "--tw-prose-invert-th-borders": colors.gray[600],
      "--tw-prose-invert-td-borders": colors.gray[700],
    },
  },

  zinc: {
    css: {
      "--tw-prose-body": colors.zinc[700],
      "--tw-prose-headings": colors.zinc[900],
      "--tw-prose-lead": colors.zinc[600],
      "--tw-prose-links": colors.zinc[900],
      "--tw-prose-bold": colors.zinc[900],
      "--tw-prose-counters": colors.zinc[500],
      "--tw-prose-bullets": colors.zinc[300],
      "--tw-prose-hr": colors.zinc[200],
      "--tw-prose-quotes": colors.zinc[900],
      "--tw-prose-quote-borders": colors.zinc[200],
      "--tw-prose-captions": colors.zinc[500],
      "--tw-prose-code": colors.zinc[900],
      "--tw-prose-pre-code": colors.zinc[200],
      "--tw-prose-pre-bg": colors.zinc[800],
      "--tw-prose-th-borders": colors.zinc[300],
      "--tw-prose-td-borders": colors.zinc[200],
      "--tw-prose-invert-body": colors.zinc[300],
      "--tw-prose-invert-headings": colors.white,
      "--tw-prose-invert-lead": colors.zinc[400],
      "--tw-prose-invert-links": colors.white,
      "--tw-prose-invert-bold": colors.white,
      "--tw-prose-invert-counters": colors.zinc[400],
      "--tw-prose-invert-bullets": colors.zinc[600],
      "--tw-prose-invert-hr": colors.zinc[700],
      "--tw-prose-invert-quotes": colors.zinc[100],
      "--tw-prose-invert-quote-borders": colors.zinc[700],
      "--tw-prose-invert-captions": colors.zinc[400],
      "--tw-prose-invert-code": colors.white,
      "--tw-prose-invert-pre-code": colors.zinc[300],
      "--tw-prose-invert-pre-bg": "rgb(0 0 0 / 50%)",
      "--tw-prose-invert-th-borders": colors.zinc[600],
      "--tw-prose-invert-td-borders": colors.zinc[700],
    },
  },

  neutral: {
    css: {
      "--tw-prose-body": colors.neutral[700],
      "--tw-prose-headings": colors.neutral[900],
      "--tw-prose-lead": colors.neutral[600],
      "--tw-prose-links": colors.neutral[900],
      "--tw-prose-bold": colors.neutral[900],
      "--tw-prose-counters": colors.neutral[500],
      "--tw-prose-bullets": colors.neutral[300],
      "--tw-prose-hr": colors.neutral[200],
      "--tw-prose-quotes": colors.neutral[900],
      "--tw-prose-quote-borders": colors.neutral[200],
      "--tw-prose-captions": colors.neutral[500],
      "--tw-prose-code": colors.neutral[900],
      "--tw-prose-pre-code": colors.neutral[200],
      "--tw-prose-pre-bg": colors.neutral[800],
      "--tw-prose-th-borders": colors.neutral[300],
      "--tw-prose-td-borders": colors.neutral[200],
      "--tw-prose-invert-body": colors.neutral[300],
      "--tw-prose-invert-headings": colors.white,
      "--tw-prose-invert-lead": colors.neutral[400],
      "--tw-prose-invert-links": colors.white,
      "--tw-prose-invert-bold": colors.white,
      "--tw-prose-invert-counters": colors.neutral[400],
      "--tw-prose-invert-bullets": colors.neutral[600],
      "--tw-prose-invert-hr": colors.neutral[700],
      "--tw-prose-invert-quotes": colors.neutral[100],
      "--tw-prose-invert-quote-borders": colors.neutral[700],
      "--tw-prose-invert-captions": colors.neutral[400],
      "--tw-prose-invert-code": colors.white,
      "--tw-prose-invert-pre-code": colors.neutral[300],
      "--tw-prose-invert-pre-bg": "rgb(0 0 0 / 50%)",
      "--tw-prose-invert-th-borders": colors.neutral[600],
      "--tw-prose-invert-td-borders": colors.neutral[700],
    },
  },

  stone: {
    css: {
      "--tw-prose-body": colors.stone[700],
      "--tw-prose-headings": colors.stone[900],
      "--tw-prose-lead": colors.stone[600],
      "--tw-prose-links": colors.stone[900],
      "--tw-prose-bold": colors.stone[900],
      "--tw-prose-counters": colors.stone[500],
      "--tw-prose-bullets": colors.stone[300],
      "--tw-prose-hr": colors.stone[200],
      "--tw-prose-quotes": colors.stone[900],
      "--tw-prose-quote-borders": colors.stone[200],
      "--tw-prose-captions": colors.stone[500],
      "--tw-prose-code": colors.stone[900],
      "--tw-prose-pre-code": colors.stone[200],
      "--tw-prose-pre-bg": colors.stone[800],
      "--tw-prose-th-borders": colors.stone[300],
      "--tw-prose-td-borders": colors.stone[200],
      "--tw-prose-invert-body": colors.stone[300],
      "--tw-prose-invert-headings": colors.white,
      "--tw-prose-invert-lead": colors.stone[400],
      "--tw-prose-invert-links": colors.white,
      "--tw-prose-invert-bold": colors.white,
      "--tw-prose-invert-counters": colors.stone[400],
      "--tw-prose-invert-bullets": colors.stone[600],
      "--tw-prose-invert-hr": colors.stone[700],
      "--tw-prose-invert-quotes": colors.stone[100],
      "--tw-prose-invert-quote-borders": colors.stone[700],
      "--tw-prose-invert-captions": colors.stone[400],
      "--tw-prose-invert-code": colors.white,
      "--tw-prose-invert-pre-code": colors.stone[300],
      "--tw-prose-invert-pre-bg": "rgb(0 0 0 / 50%)",
      "--tw-prose-invert-th-borders": colors.stone[600],
      "--tw-prose-invert-td-borders": colors.stone[700],
    },
  },

  // Link-only themes (for backward compatibility)

  red: {
    css: {
      "--tw-prose-links": colors.red[600],
      "--tw-prose-invert-links": colors.red[500],
    },
  },

  orange: {
    css: {
      "--tw-prose-links": colors.orange[600],
      "--tw-prose-invert-links": colors.orange[500],
    },
  },

  amber: {
    css: {
      "--tw-prose-links": colors.amber[600],
      "--tw-prose-invert-links": colors.amber[500],
    },
  },

  yellow: {
    css: {
      "--tw-prose-links": colors.yellow[600],
      "--tw-prose-invert-links": colors.yellow[500],
    },
  },

  lime: {
    css: {
      "--tw-prose-links": colors.lime[600],
      "--tw-prose-invert-links": colors.lime[500],
    },
  },

  green: {
    css: {
      "--tw-prose-links": colors.green[600],
      "--tw-prose-invert-links": colors.green[500],
    },
  },

  emerald: {
    css: {
      "--tw-prose-links": colors.emerald[600],
      "--tw-prose-invert-links": colors.emerald[500],
    },
  },

  teal: {
    css: {
      "--tw-prose-links": colors.teal[600],
      "--tw-prose-invert-links": colors.teal[500],
    },
  },

  cyan: {
    css: {
      "--tw-prose-links": colors.cyan[600],
      "--tw-prose-invert-links": colors.cyan[500],
    },
  },

  sky: {
    css: {
      "--tw-prose-links": colors.sky[600],
      "--tw-prose-invert-links": colors.sky[500],
    },
  },

  blue: {
    css: {
      "--tw-prose-links": colors.blue[600],
      "--tw-prose-invert-links": colors.blue[500],
    },
  },

  indigo: {
    css: {
      "--tw-prose-links": colors.indigo[600],
      "--tw-prose-invert-links": colors.indigo[500],
    },
  },

  violet: {
    css: {
      "--tw-prose-links": colors.violet[600],
      "--tw-prose-invert-links": colors.violet[500],
    },
  },

  purple: {
    css: {
      "--tw-prose-links": colors.purple[600],
      "--tw-prose-invert-links": colors.purple[500],
    },
  },

  fuchsia: {
    css: {
      "--tw-prose-links": colors.fuchsia[600],
      "--tw-prose-invert-links": colors.fuchsia[500],
    },
  },

  pink: {
    css: {
      "--tw-prose-links": colors.pink[600],
      "--tw-prose-invert-links": colors.pink[500],
    },
  },

  rose: {
    css: {
      "--tw-prose-links": colors.rose[600],
      "--tw-prose-invert-links": colors.rose[500],
    },
  },
};

const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // You can generate your own colors with this tool: https://javisperez.github.io/tailwindcolorshades/
        primary: {
          50: "#fcfdf7",
          100: "#f8fcee",
          200: "#eef6d5",
          300: "#e3f1bc",
          400: "#cfe78a",
          500: "#badc58",
          600: "#a7c64f",
          700: "#8ca542",
          800: "#708435",
          900: "#5b6c2b",
          DEFAULT: "#badc58",
        },
        grey: "#0d1117",
        mineshaft: {
          50: "#f5f5f5",
          100: "#ebebeb",
          200: "#ccccce",
          300: "#adaeb0",
          400: "#707174",
          500: "#323439",
          600: "#2d2f33",
          700: "#26272b",
          800: "#1e1f22",
          900: "#19191c",
          DEFAULT: "#323439",
        },
        chicago: {
          50: "#f7f7f7",
          100: "#efefef",
          200: "#d6d6d7",
          300: "#bdbebf",
          400: "#8c8d8e",
          500: "#5b5c5e",
          600: "#525355",
          700: "#444547",
          800: "#373738",
          900: "#2d2d2e",
          DEFAULT: "#5b5c5e",
        },
        bunker: {
          50: "#f3f4f4",
          100: "#e8e8e9",
          200: "#c5c6c8",
          300: "#a2a4a6",
          400: "#5d5f64",
          500: "#171b21",
          600: "#15181e",
          700: "#111419",
          800: "#0e1014",
          900: "#0b0d10",
          DEFAULT: "#171B21",
        },
        githubblack: "#020409",
        blue2: "#130f40",
        blue1: "#3498db",
        yellow: {
          50: "#fefcf3",
          100: "#fef9e7",
          200: "#fcf0c3",
          300: "#f9e79f",
          400: "#f5d657",
          500: "#f1c40f",
          600: "#d9b00e",
          700: "#b5930b",
          800: "#917609",
          900: "#766007",
          DEFAULT: "#f1c40f",
        },
        red: {
          50: "#fef6f5",
          100: "#fdedec",
          200: "#f9d2ce",
          300: "#f5b7b1",
          400: "#ee8277",
          500: "#e74c3c",
          600: "#d04436",
          700: "#ad392d",
          800: "#8b2e24",
          900: "#71251d",
          DEFAULT: "#e74c3c",
        },
        orange: "#f39c12",
        green: {
          50: "#f5fcf8",
          100: "#eafaf1",
          200: "#cbf2dc",
          300: "#abebc6",
          400: "#6ddb9c",
          500: "#2ecc71",
          600: "#29b866",
          700: "#239955",
          800: "#1c7a44",
          900: "#176437",
          DEFAULT: "#2ecc71",
        },
      },
    },
    keyframes: {
      type: {
        "0%": { transform: "translateX(0ch)" },
        "5%, 10%": { transform: "translateX(1ch)" },
        "15%, 20%": { transform: "translateX(2ch)" },
        "25%, 30%": { transform: "translateX(3ch)" },
        "35%, 40%": { transform: "translateX(4ch)" },
        "45%, 50%": { transform: "translateX(5ch)" },
        "55%, 60%": { transform: "translateX(6ch)" },
        "65%, 70%": { transform: "translateX(7ch)" },
        "75%, 80%": { transform: "translateX(8ch)" },
        "85%, 90%": { transform: "translateX(9ch)" },
        "95%, 100%": { transform: "translateX(11ch)" },
      },
      fadeIn: {
        "0%": { opacity: 0 },
        "100%": { opacity: 1 },
      },
      spin: {
        "0%": { transform: "rotate(0deg)" },
        "40%": { transform: "rotate(360deg)" },
        "100%": { transform: "rotate(360deg)" },
      },
      bounce: {
        "0%": { transform: "translateY(-90%)" },
        "100%": { transform: "translateY(-100%)" },
      },
      wiggle: {
        "0%, 100%": { transform: "rotate(-3deg)" },
        "50%": { transform: "rotate(3deg)" },
      },
      ping: {
        "75%, 100%": {
          transform: "scale(2)",
          opacity: 0,
        },
      },
      popup: {
        "0%": {
          transform: "scale(0.2)",
          opacity: 0,
          transform: "translateY(120%)",
        },
        "100%": {
          transform: "scale(1)",
          opacity: 1,
          transform: "translateY(100%)",
        },
      },
      popright: {
        "0%": {
          transform: "translateX(-100%)",
        },
        "100%": {
          transform: "translateX(0%)",
        },
      },
      popleft: {
        "0%": {
          transform: "translateX(100%)",
        },
        "100%": {
          transform: "translateX(0%)",
        },
      },
      popdown: {
        "0%": {
          transform: "scale(0.2)",
          opacity: 0,
          transform: "translateY(80%)",
        },
        "100%": {
          transform: "scale(1)",
          opacity: 1,
          transform: "translateY(100%)",
        },
      },
    },
    animation: {
      fadeIn: "fadeIn 1000ms ease-in-out",
      bounce: "bounce 1000ms ease-in-out infinite",
      spin: "spin 4000ms ease-in-out infinite",
      cursor: "cursor .6s linear infinite alternate",
      type: "type 2.7s ease-out .8s infinite alternate both",
      "type-reverse": "type 1.8s ease-out 0s infinite alternate-reverse both",
      wiggle: "wiggle 200ms ease-in-out",
      ping: "ping 1000ms ease-in-out infinite",
      popup: "popup 300ms ease-in-out",
      popdown: "popdown 300ms ease-in-out",
      popright: "popright 100ms ease-in-out",
      popleft: "popleft 100ms ease-in-out",
    },
    fontSize: {
      xxxs: ".23rem",
      xxs: ".5rem",
      xs: ".75rem",
      sm: ".875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
      "6xl": "4rem",
      "7xl": "5rem",
      "8xl": "6rem",
      "9xl": "7rem",
    },
    typography: (theme) => ({
      DEFAULT: {
        css: [
          {
            color: "var(--tw-prose-body)",
            maxWidth: "65ch",
            '[class~="lead"]': {
              color: "var(--tw-prose-lead)",
            },
            a: {
              color: colors.gray[200],
              textDecoration: "underline",
              fontWeight: "500",
            },
            strong: {
              color: colors.gray[200],
              fontWeight: "600",
            },
            "a strong": {
              color: "inherit",
            },
            "blockquote strong": {
              color: "inherit",
            },
            "thead th strong": {
              color: "inherit",
            },
            ol: {
              listStyleType: "decimal",
            },
            'ol[type="A"]': {
              listStyleType: "upper-alpha",
            },
            'ol[type="a"]': {
              listStyleType: "lower-alpha",
            },
            'ol[type="A" s]': {
              listStyleType: "upper-alpha",
            },
            'ol[type="a" s]': {
              listStyleType: "lower-alpha",
            },
            'ol[type="I"]': {
              listStyleType: "upper-roman",
            },
            'ol[type="i"]': {
              listStyleType: "lower-roman",
            },
            'ol[type="I" s]': {
              listStyleType: "upper-roman",
            },
            'ol[type="i" s]': {
              listStyleType: "lower-roman",
            },
            'ol[type="1"]': {
              listStyleType: "decimal",
            },
            ul: {
              listStyleType: "disc",
            },
            "ol > li::marker": {
              fontWeight: "400",
              color: "var(--tw-prose-counters)",
            },
            "ul > li::marker": {
              color: "var(--tw-prose-bullets)",
            },
            hr: {
              borderColor: "var(--tw-prose-hr)",
              borderTopWidth: 1,
            },
            blockquote: {
              fontWeight: "500",
              fontStyle: "italic",
              color: "var(--tw-prose-quotes)",
              borderLeftWidth: "0.25rem",
              borderLeftColor: "var(--tw-prose-quote-borders)",
              quotes: '"\\201C""\\201D""\\2018""\\2019"',
            },
            "blockquote p:first-of-type::before": {
              content: "open-quote",
            },
            "blockquote p:last-of-type::after": {
              content: "close-quote",
            },
            h1: {
              color: colors.gray[200],
              fontWeight: "800",
            },
            "h1 strong": {
              fontWeight: "900",
              color: "inherit",
            },
            h2: {
              color: colors.gray[200],
              fontWeight: "700",
            },
            "h2 strong": {
              fontWeight: "800",
              color: "inherit",
            },
            h3: {
              color: colors.gray[300],
              fontWeight: "600",
            },
            "h3 strong": {
              fontWeight: "700",
              color: "inherit",
            },
            h4: {
              color: colors.gray[400],
              fontWeight: "600",
            },
            "h4 strong": {
              fontWeight: "700",
              color: "inherit",
            },
            // TODO: Figure out how to not need these, it's a merging issue
            img: {},
            "figure > *": {},
            figcaption: {
              color: "var(--tw-prose-captions)",
            },
            code: {
              color: "var(--tw-prose-code)",
              fontWeight: "600",
            },
            "code::before": {
              content: '"`"',
            },
            "code::after": {
              content: '"`"',
            },
            "a code": {
              color: "inherit",
            },
            "h1 code": {
              color: "inherit",
            },
            "h2 code": {
              color: "inherit",
            },
            "h3 code": {
              color: "inherit",
            },
            "h4 code": {
              color: "inherit",
            },
            "blockquote code": {
              color: "inherit",
            },
            "thead th code": {
              color: "inherit",
            },
            pre: {
              color: "var(--tw-prose-pre-code)",
              backgroundColor: colors.gray[800],
              overflowX: "auto",
              fontWeight: "400",
            },
            "pre code": {
              backgroundColor: "transparent",
              borderWidth: "0",
              borderRadius: "0",
              padding: "0",
              fontWeight: "inherit",
              color: "inherit",
              fontSize: "inherit",
              fontFamily: "inherit",
              lineHeight: "inherit",
            },
            "pre code::before": {
              content: "none",
            },
            "pre code::after": {
              content: "none",
            },
            table: {
              width: "100%",
              tableLayout: "auto",
              textAlign: "left",
              marginTop: em(32, 16),
              marginBottom: em(32, 16),
            },
            thead: {
              borderBottomWidth: "1px",
              borderBottomColor: "var(--tw-prose-th-borders)",
            },
            "thead th": {
              color: "var(--tw-prose-headings)",
              fontWeight: "600",
              verticalAlign: "bottom",
            },
            "tbody tr": {
              borderBottomWidth: "1px",
              borderBottomColor: "var(--tw-prose-td-borders)",
            },
            "tbody tr:last-child": {
              borderBottomWidth: "0",
            },
            "tbody td": {
              verticalAlign: "baseline",
            },
            tfoot: {
              borderTopWidth: "1px",
              borderTopColor: "var(--tw-prose-th-borders)",
            },
            "tfoot td": {
              verticalAlign: "top",
            },
          },
          defaultModifiers.gray.css,
          ...defaultModifiers.base.css,
        ],
      },
      ...defaultModifiers,
    }),
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".no-scrollbar::-webkit-scrollbar": {
          display: "none",
        },
        ".no-scrollbar": {
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
        },
      });
    }),
    require("@tailwindcss/typography"),
  ],
};
