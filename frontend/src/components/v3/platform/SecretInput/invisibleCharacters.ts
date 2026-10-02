export type InvisibleCharacterSummary = {
  codePoint: string;
  label: string;
  count: number;
};

export type SecretValuePart = {
  text: string;
  isSuspicious: boolean;
};

const ALLOWED_WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

const SUSPICIOUS_CATEGORY_REGEX = /^[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}]$/u;

const EMOJI_SEQUENCE_REGEX =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)*(?:\u200D\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)*)+|\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}/gu;

export const isSuspiciousCharacter = (char: string) =>
  !ALLOWED_WHITESPACE.has(char) && SUSPICIOUS_CATEGORY_REGEX.test(char);

const getCharacterLabel = (char: string) => {
  if (/\p{Bidi_Control}/u.test(char)) return "Bidirectional control";
  if (/\p{Cc}/u.test(char)) return "Control character";
  if (/\p{Zs}/u.test(char)) return "Unicode space";
  if (/\p{Zl}/u.test(char)) return "Line separator";
  if (/\p{Zp}/u.test(char)) return "Paragraph separator";
  return "Formatting character";
};

export const splitSuspiciousCharacters = (value: string): SecretValuePart[] => {
  const parts: SecretValuePart[] = [];

  const pushPlain = (text: string) => {
    const last = parts[parts.length - 1];
    if (last && !last.isSuspicious) {
      last.text += text;
    } else {
      parts.push({ text, isSuspicious: false });
    }
  };

  const scan = (text: string) => {
    Array.from(text).forEach((char) => {
      if (isSuspiciousCharacter(char)) {
        parts.push({ text: char, isSuspicious: true });
      } else {
        pushPlain(char);
      }
    });
  };

  let offset = 0;
  Array.from(value.matchAll(EMOJI_SEQUENCE_REGEX)).forEach((match) => {
    const index = match.index ?? 0;
    scan(value.slice(offset, index));
    pushPlain(match[0]);
    offset = index + match[0].length;
  });
  scan(value.slice(offset));

  return parts;
};

export const getInvisibleCharacterSummary = (value: string): InvisibleCharacterSummary[] => {
  const summary = new Map<number, InvisibleCharacterSummary>();

  splitSuspiciousCharacters(value).forEach(({ text, isSuspicious }) => {
    if (!isSuspicious) return;
    const code = text.codePointAt(0) ?? 0;
    const entry = summary.get(code);
    if (entry) {
      entry.count += 1;
      return;
    }
    summary.set(code, {
      codePoint: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
      label: getCharacterLabel(text),
      count: 1
    });
  });

  return Array.from(summary.values());
};
