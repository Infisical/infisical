/** Extracts the key and value from a passed in env string based on the provided delimiters. */
export const getKeyValue = (pastedContent: string, delimiters: string[]) => {
  let splitIndex = -1
  let key = ""
  let value = ""

  for (const delimiter of delimiters) {
    const idx = pastedContent.indexOf(delimiter)

    if (idx !== -1) {
      splitIndex = idx
      break;
    }
  }

  // if only key is pasted
  if (splitIndex === -1) {
    key = pastedContent.trim()
    return { key, value: "" }
  }

  key = pastedContent.slice(0, splitIndex).trim()
  value = pastedContent.slice(splitIndex + 1).trim()

  return { key, value }
};
