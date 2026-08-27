import { PendingAction } from "@app/hooks/api/secretFolders/types";

export const pendingActionBorderClass = (action?: PendingAction) => {
  switch (action) {
    case PendingAction.Create:
    case PendingAction.Update:
      return "shadow-[inset_2px_0_0_0_var(--color-project)]/50";
    case PendingAction.Delete:
      return "shadow-[inset_2px_0_0_0_var(--color-danger)]/50";
    default:
      return "";
  }
};

export const pendingActionRowClass = (action?: PendingAction) => {
  switch (action) {
    case PendingAction.Create:
    case PendingAction.Update:
      return "bg-project/[0.025]";
    case PendingAction.Delete:
      return "bg-danger/[0.025]";
    default:
      return "";
  }
};
