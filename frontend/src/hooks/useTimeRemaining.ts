import { useEffect, useState } from "react";

const formatRemaining = (remainingSeconds: number) => {
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m ${seconds}s remaining`;
};

/** Live countdown to an expiry, ticking every second. */
export const useTimeRemaining = (expiresAt?: string | null) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) return undefined;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return { label: "", isExpired: false };

  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  if (remainingSeconds === 0) return { label: "Expired", isExpired: true };

  return { label: formatRemaining(remainingSeconds), isExpired: false };
};
