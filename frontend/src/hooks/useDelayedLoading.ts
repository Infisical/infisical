import { useEffect, useState } from "react";

type UseDelayedLoadingOptions = {
  delay?: number;
  resetKey?: string | number;
};

export const useDelayedLoading = (
  isLoading: boolean,
  { delay = 200, resetKey }: UseDelayedLoadingOptions = {}
) => {
  const [isDelayedLoading, setIsDelayedLoading] = useState(false);

  useEffect(() => {
    setIsDelayedLoading(false);

    if (!isLoading) return undefined;

    const timeout = window.setTimeout(() => setIsDelayedLoading(true), delay);

    return () => window.clearTimeout(timeout);
  }, [delay, isLoading, resetKey]);

  return isLoading && isDelayedLoading;
};
