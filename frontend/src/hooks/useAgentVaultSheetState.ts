import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export const agentVaultSheetSearchParams = z.object({
  sessionId: z.string().uuid().optional().catch(undefined)
});

export const agentVaultSkillSheetSearchParams = z.object({
  skillId: z.string().uuid().optional().catch(undefined)
});

export const useAgentVaultSheetState = (param: "sessionId" | "skillId" = "sessionId") => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const id = search[param] as string | undefined;

  return {
    id,
    isOpen: Boolean(id),
    openSheet: (nextId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: { ...search, [param]: nextId } as any });
    },
    closeSheet: () => {
      const rest = Object.fromEntries(Object.entries(search).filter(([key]) => key !== param));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return navigate({ search: rest as any });
    }
  };
};
