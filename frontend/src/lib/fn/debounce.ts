export const debounce = <A extends unknown[]>(
  func: (...args: A) => unknown,
  delay: number
): ((...args: A) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null;
  return function debounced(...args: A) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
};
