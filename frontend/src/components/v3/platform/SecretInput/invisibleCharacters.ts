export const INVISIBLE_CHAR_REGEX =
  // eslint-disable-next-line no-control-regex
  /([\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u00a0\u00ad\u1680\u2000-\u200f\u2028-\u202f\u205f\u2060\u2066-\u2069\u3000\ufeff])/g;

export type InvisibleCharacterSummary = {
  codePoint: string;
  label: string;
  count: number;
};

const CHARACTER_LABELS: Record<number, string> = {
  0x00a0: "Non-breaking space",
  0x00ad: "Soft hyphen",
  0x1680: "Ogham space mark",
  0x200b: "Zero-width space",
  0x200c: "Zero-width non-joiner",
  0x200d: "Zero-width joiner",
  0x200e: "Left-to-right mark",
  0x200f: "Right-to-left mark",
  0x2028: "Line separator",
  0x2029: "Paragraph separator",
  0x202f: "Narrow no-break space",
  0x205f: "Medium mathematical space",
  0x2060: "Word joiner",
  0x3000: "Ideographic space",
  0xfeff: "Byte order mark"
};

const getCharacterLabel = (code: number) => {
  if (CHARACTER_LABELS[code]) return CHARACTER_LABELS[code];
  if (code <= 0x001f || (code >= 0x007f && code <= 0x009f)) return "Control character";
  if (code >= 0x2000 && code <= 0x200a) return "Unicode space";
  return "Bidirectional control";
};

export const getInvisibleCharacterSummary = (value: string): InvisibleCharacterSummary[] => {
  const summary = new Map<number, InvisibleCharacterSummary>();

  Array.from(value.matchAll(INVISIBLE_CHAR_REGEX)).forEach(([char]) => {
    const code = char.charCodeAt(0);
    const entry = summary.get(code);
    if (entry) {
      entry.count += 1;
      return;
    }
    summary.set(code, {
      codePoint: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
      label: getCharacterLabel(code),
      count: 1
    });
  });

  return Array.from(summary.values());
};
