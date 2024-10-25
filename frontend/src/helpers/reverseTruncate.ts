export const reverseTruncate = (text: string, maxLength = 42) => {
  if (text.length < maxLength) return text;

  return `...${text.substring(text.length - maxLength + 3)}`;
};
