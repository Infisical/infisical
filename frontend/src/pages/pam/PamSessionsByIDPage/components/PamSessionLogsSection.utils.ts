// This function trims top and bottom empty padding, as well as moves all relative text to the left while still respecting indentation
export const formatLogContent = (text: string | null | undefined): string => {
  if (!text) return "";

  let lines = text.split("\n");

  // Find the first and last non-empty lines to trim vertical padding
  let firstLineIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== "") {
      firstLineIndex = i;
      break;
    }
  }

  if (firstLineIndex === -1) {
    return "";
  }

  let lastLineIndex = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== "") {
      lastLineIndex = i;
      break;
    }
  }

  lines = lines.slice(firstLineIndex, lastLineIndex + 1);

  // Determine the minimum indentation of non-empty lines
  const indentations = lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const match = line.match(/^\s*/);
      return match ? match[0].length : 0;
    });

  const minIndentation = indentations.length > 0 ? Math.min(...indentations) : 0;

  // Remove the common indentation from all lines
  if (minIndentation > 0) {
    lines = lines.map((line) => line.substring(minIndentation));
  }

  return lines.join("\n");
};
