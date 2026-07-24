import { useCallback, useEffect, useState } from "react";

// UX-only delay. This does not enforce throttling or replace server-side rate limits.
export const useClientResendDelay = (delaySeconds: number) => {
  const [delayEndTime, setDelayEndTime] = useState(() =>
    delaySeconds > 0 ? Date.now() + delaySeconds * 1000 : 0
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.ceil((delayEndTime - Date.now()) / 1000))
  );

  useEffect(() => {
    const updateRemainingSeconds = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((delayEndTime - Date.now()) / 1000)));
    };

    updateRemainingSeconds();
    if (delayEndTime <= Date.now()) return undefined;

    const timer = window.setInterval(() => {
      const nextRemainingSeconds = Math.max(0, Math.ceil((delayEndTime - Date.now()) / 1000));
      setRemainingSeconds(nextRemainingSeconds);
      if (nextRemainingSeconds === 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [delayEndTime]);

  const restartDelay = useCallback(() => {
    setDelayEndTime(Date.now() + delaySeconds * 1000);
  }, [delaySeconds]);

  return { remainingSeconds, restartDelay };
};
