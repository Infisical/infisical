/** The smallest single replacement that turns `current` into `next`: the text between their common prefix and suffix. */
export const getChangedRange = (current: string, next: string) => {
  const max = Math.min(current.length, next.length);
  let start = 0;
  while (start < max && current[start] === next[start]) start += 1;
  let end = 0;
  while (end < max - start && current[current.length - 1 - end] === next[next.length - 1 - end])
    end += 1;
  return { from: start, to: current.length - end, insert: next.slice(start, next.length - end) };
};

// CodeMirror splits lines on \r\n and \r as well and its document joins them with \n, so a value is compared in that form.
export const toEditorText = (value: string) => value.replace(/\r\n?/g, "\n");
