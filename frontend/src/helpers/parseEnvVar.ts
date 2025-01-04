/** Extracts the key and value from a passed in env string based on the provided delimiters. */
export const getKeyValue = (pastedContent: string, delimiters: string[]) => {
  if (!pastedContent) {
    return { key: "", value: "" };
  }

  let firstDelimiterIndex = -1;
  let foundDelimiter = "";

  delimiters.forEach((delimiter) => {
    const index = pastedContent.indexOf(delimiter);
    if (index !== -1 && (firstDelimiterIndex === -1 || index < firstDelimiterIndex)) {
      firstDelimiterIndex = index;
      foundDelimiter = delimiter;
    }
  });

  const hasValueAfterDelimiter = pastedContent.length > firstDelimiterIndex + foundDelimiter.length;

  if (firstDelimiterIndex === -1 || !hasValueAfterDelimiter) {
    return { key: pastedContent.trim(), value: "" };
  }

  const key = pastedContent.substring(0, firstDelimiterIndex);
  const value = pastedContent.substring(firstDelimiterIndex + foundDelimiter.length);

  return {
    key: key.trim(),
    value: value.trim()
  };
};
