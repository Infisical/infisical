import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export enum PamSheetAction {
  Launch = "launch"
}

export const pamSheetSearchParams = z.object({
  accountId: z.string().optional().catch(undefined),
  action: z.nativeEnum(PamSheetAction).optional().catch(undefined)
});

export const usePamSheetState = () => {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { accountId, action } = search as z.infer<typeof pamSheetSearchParams>;

  return {
    selectedAccountId: accountId,
    selectedAction: action,
    openSheet: (type: PamSheetAction, id: string) => {
      navigate({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search: { ...search, accountId: id, action: type } as any
      });
    },
    closeSheet: () => {
      const rest = Object.fromEntries(
        Object.entries(search).filter(([k]) => k !== "accountId" && k !== "action")
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ search: rest as any });
    }
  };
};
