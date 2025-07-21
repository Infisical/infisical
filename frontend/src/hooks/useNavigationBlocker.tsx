import { useCallback } from "react";
import { useBlocker } from "@tanstack/react-router";

import {
  BatchContext,
  useBatchModeActions
} from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

type TNavigationBlockerReturn = {
  isBlocked: boolean;
};

export const useNavigationBlocker = ({
  shouldBlock = false,
  message = "Are you sure you want to leave? You may have unsaved changes.",
  context
}: {
  shouldBlock: boolean;
  message: string;
  context: BatchContext;
}): TNavigationBlockerReturn => {
  const { clearAllPendingChanges } = useBatchModeActions();
  const blockerFn = useCallback(() => {
    if (!shouldBlock) return false;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(message);
    if (confirmed) {
      clearAllPendingChanges(context);
    }

    return !confirmed;
  }, [shouldBlock, message, context]);

  useBlocker(blockerFn, shouldBlock);

  return {
    isBlocked: shouldBlock
  };
};
