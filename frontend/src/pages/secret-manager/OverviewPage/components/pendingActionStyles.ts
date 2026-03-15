import { PendingAction } from "@app/hooks/api/secretFolders/types";

export const pendingActionBorderClass = (action?: PendingAction) => {
  switch (action) {
    case PendingAction.Create:
      return "shadow-[inset_2px_0_0_0_var(--color-success)]/50";
    case PendingAction.Update:
      return "shadow-[inset_2px_0_0_0_var(--color-warning)]/50";
    case PendingAction.Delete:
      return "shadow-[inset_2px_0_0_0_var(--color-danger)]/50";
    default:
      return "";
  }
};

export const pendingActionRowClass = (action?: PendingAction) => {
  switch (action) {
    case PendingAction.Create:
      return "bg-success/[0.025]";
    case PendingAction.Update:
      return "bg-warning/[0.025]";
    case PendingAction.Delete:
      return "bg-danger/[0.025]";
    default:
      return "";
  }
};
