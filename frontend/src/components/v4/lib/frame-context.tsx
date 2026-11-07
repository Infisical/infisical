import * as React from "react";

const FrameContext = React.createContext(false);

/** Marks a subtree as inside a framed container, or, with framed false, starts a fresh surface such as an overlay. */
export function FrameScope({ framed, children }: { framed: boolean; children: React.ReactNode }) {
  return <FrameContext value={framed}>{children}</FrameContext>;
}

/**
 * Whether this primitive renders inside a framed container, where it drops its own frame so two frames never nest.
 * Pass the variant the caller asked for to warn in development when an explicit framed variant is dropped.
 */
export function useInFrame(component: string, requested?: string): boolean {
  const inFrame = React.useContext(FrameContext);
  const forced = inFrame && requested === "framed";
  React.useEffect(() => {
    if (import.meta.env.DEV && forced)
      console.warn(
        `${component} variant="framed" renders inside another framed container, so it drops to its frameless treatment. Remove the variant.`
      );
  }, [component, forced]);
  return inFrame;
}
