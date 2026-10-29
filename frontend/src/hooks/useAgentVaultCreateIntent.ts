import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export const agentVaultCreateIntentSearchParams = z.object({
  create: z.boolean().optional().catch(undefined)
});

// Long enough for the page to paint first, so the dialog doesn't land on top of a page nobody saw.
const OPEN_DELAY_MS = 350;

// Opens a page's create flow when a link asked for it with `?create=true`, then drops the flag so a
// reload or a back navigation doesn't open it again.
export const useAgentVaultCreateIntent = (open: () => void, isReady = true) => {
  const navigate = useNavigate();
  const shouldCreate = useSearch({
    strict: false,
    select: (search) => Boolean((search as { create?: boolean }).create)
  });

  useEffect(() => {
    if (!shouldCreate || !isReady) return undefined;
    const timer = setTimeout(() => {
      open();
      navigate({ to: ".", search: (prev) => ({ ...prev, create: undefined }), replace: true });
    }, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldCreate, isReady]);
};
