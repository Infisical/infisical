import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export enum PamSheetTab {
  Launch = "launch",
  Permissions = "permissions",
  Configuration = "configuration",
  Advanced = "advanced",
  General = "general",
  Rotation = "rotation",
  Approvals = "approvals"
}

export const pamSheetSearchParams = z.object({
  accountId: z.string().optional().catch(undefined),
  folderId: z.string().optional().catch(undefined),
  templateId: z.string().optional().catch(undefined),
  sessionId: z.string().optional().catch(undefined),
  tab: z.nativeEnum(PamSheetTab).optional().catch(undefined)
});

export type PamSheetKey = "accountId" | "folderId" | "templateId" | "sessionId";

export const usePamSheetState = (key: PamSheetKey) => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const selectedId = search[key] as string | undefined;
  const tab = search.tab as PamSheetTab | undefined;

  return {
    selectedId,
    isOpen: Boolean(selectedId),
    tab,
    openSheet: (id: string, initialTab?: PamSheetTab) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: { ...search, [key]: id, tab: initialTab } as any });
    },
    setTab: (newTab: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: { ...search, tab: newTab } as any, replace: true });
    },
    closeSheet: () => {
      const rest = Object.fromEntries(
        Object.entries(search).filter(([k]) => k !== key && k !== "tab")
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: rest as any });
    }
  };
};
