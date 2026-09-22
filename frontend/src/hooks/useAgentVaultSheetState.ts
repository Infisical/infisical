import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export const agentVaultSheetSearchParams = z.object({
  sessionId: z.string().uuid().optional().catch(undefined)
});

/**
 * Sheet open/closed lives in the URL, so a timeline is a link someone can send and the back button
 * closes the sheet rather than leaving the page.
 *
 * Modelled on usePamSheetState, deliberately copied rather than shared: nothing under pages/pam or its
 * hooks may be imported from here.
 */
export const useAgentVaultSheetState = () => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const sessionId = search.sessionId as string | undefined;

  return {
    sessionId,
    isOpen: Boolean(sessionId),
    openSheet: (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: { ...search, sessionId: id } as any });
    },
    closeSheet: () => {
      const rest = Object.fromEntries(
        Object.entries(search).filter(([key]) => key !== "sessionId")
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: rest as any });
    }
  };
};
