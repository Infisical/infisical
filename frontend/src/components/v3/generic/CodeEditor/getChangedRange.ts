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
