import { useEffect, useRef, useState } from "react";

type UseDelayedLoadingOptions = {
  delay?: number;
  // Once shown, keep the loading state up at least this long, so a request that lands just after
  // `delay` does not flash it on and straight back off.
  minDuration?: number;
  resetKey?: string | number;
};

export const useDelayedLoading = (
  isLoading: boolean,
  { delay = 200, minDuration = 0, resetKey }: UseDelayedLoadingOptions = {}
) => {
  const [isDelayedLoading, setIsDelayedLoading] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isLoading) return undefined;

    shownAtRef.current = null;
    setIsDelayedLoading(false);

    const timeout = window.setTimeout(() => {
      shownAtRef.current = Date.now();
      setIsDelayedLoading(true);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [delay, isLoading, resetKey]);

  useEffect(() => {
    if (isLoading) return undefined;

    const hide = () => {
      shownAtRef.current = null;
      setIsDelayedLoading(false);
    };

    const remaining =
      shownAtRef.current === null ? 0 : minDuration - (Date.now() - shownAtRef.current);
    if (remaining <= 0) {
      hide();
      return undefined;
    }

    const timeout = window.setTimeout(hide, remaining);
    return () => window.clearTimeout(timeout);
  }, [isLoading, minDuration]);

  return minDuration > 0 ? isDelayedLoading : isLoading && isDelayedLoading;
};
