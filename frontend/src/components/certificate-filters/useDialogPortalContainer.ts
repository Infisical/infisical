import { useCallback, useState } from "react";

export const useDialogPortalContainer = <TElement extends HTMLElement>() => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const ref = useCallback((node: TElement | null) => {
    if (node) setPortalContainer(node.closest<HTMLElement>('[role="dialog"]'));
  }, []);

  return { ref, portalContainer: portalContainer ?? undefined };
};
