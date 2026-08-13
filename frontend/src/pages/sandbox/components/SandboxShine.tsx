import { useEffect, useState } from "react";

/**
 * The one-off chrome sweep played across a sandbox the first time you land on it after creating it.
 *
 * The trigger is handed over through sessionStorage rather than played by the wizard, because the
 * wizard unmounts on navigation: anything it started would finish over the page you are leaving.
 */

const KEY = "infisical.sandbox.justCreated";

export const markSandboxJustCreated = (sandboxId: string) => {
  try {
    sessionStorage.setItem(KEY, sandboxId);
  } catch {
    // private mode or a storage-less context; the sweep is decorative, so losing it is fine
  }
};

export const SandboxShine = ({ sandboxId }: { sandboxId: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Driven off the animation ending rather than a timer. A timer set up here is cleared by the
  // effect cleanup that React runs on the StrictMode double-invoke, and since the sessionStorage key
  // is consumed on the first pass the second never re-arms it, leaving the sweep parked on screen.
  useEffect(() => {
    let isPending = false;
    try {
      isPending = sessionStorage.getItem(KEY) === sandboxId;
      if (isPending) sessionStorage.removeItem(KEY);
    } catch {
      return undefined;
    }

    if (isPending && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsPlaying(true);
    }

    return undefined;
  }, [sandboxId]);

  if (!isPlaying) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-200 overflow-hidden">
      <span className="sandbox-shine" onAnimationEnd={() => setIsPlaying(false)} />
    </div>
  );
};
