import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export const pamSheetSearchParams = z.object({
  accountId: z.string().optional().catch(undefined),
  folderId: z.string().optional().catch(undefined),
  templateId: z.string().optional().catch(undefined),
  tab: z.string().optional().catch(undefined)
});

export type PamSheetKey = "accountId" | "folderId" | "templateId";

export const usePamSheetState = (key: PamSheetKey) => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const selectedId = search[key] as string | undefined;
  const tab = search.tab as string | undefined;

  return {
    selectedId,
    isOpen: Boolean(selectedId),
    tab,
    openSheet: (id: string, initialTab?: string) => {
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
