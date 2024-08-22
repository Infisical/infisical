/** Extracts the key and value from a passed in env string based on the provided delimiters. */
export const getKeyValue = (pastedContent: string, delimiters: string[]) => {
  const foundDelimiter = delimiters.find((delimiter) => pastedContent.includes(delimiter));

  if (!foundDelimiter) {
    return { key: pastedContent.trim(), value: "" };
  }

  const [key, value] = pastedContent.split(foundDelimiter);
  return {
    key: key.trim(),
    value: (value ?? "").trim()
  };
};
