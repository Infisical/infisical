const NAMES_SHOWN = 3;

/**
 * Names a list for a sentence: "a", "a and b", "a, b and c", and past three, "a, b, c and 4 more". `total` counts
 * names a page didn't load, so a capped list still reports how many there are.
 */
export const nameList = (names: string[], total = names.length) => {
  const shown = names.slice(0, NAMES_SHOWN);
  const more = total - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  if (shown.length <= 2) return shown.join(" and ");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
};
