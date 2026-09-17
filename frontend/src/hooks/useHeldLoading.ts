import { useEffect, useRef, useState } from "react";

// Holds a loading flag on screen for a legible minimum. A cached or local answer can arrive faster
// than a skeleton can be read, which makes a reload look like a flicker rather than a reload; a
// request slower than the minimum is unaffected.
export const useHeldLoading = (isLoading: boolean, minMs = 500) => {
  const [isHeld, setIsHeld] = useState(isLoading);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (isLoading) {
      startedAt.current = Date.now();
      setIsHeld(true);
      return undefined;
    }

    const remaining = minMs - (Date.now() - startedAt.current);
    if (remaining <= 0) {
      setIsHeld(false);
      return undefined;
    }

    const timer = setTimeout(() => setIsHeld(false), remaining);
    return () => clearTimeout(timer);
  }, [isLoading, minMs]);

  return isLoading || isHeld;
};
