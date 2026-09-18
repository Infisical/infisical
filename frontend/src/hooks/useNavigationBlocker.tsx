import { useCallback } from "react";
import { type ShouldBlockFn, useBlocker } from "@tanstack/react-router";

import {
  BatchContext,
  useBatchModeActions
} from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

type TNavigationBlockerReturn = {
  isBlocked: boolean;
};

export const useNavigationBlocker = ({
  shouldBlock = false,
  shouldBlockNavigation,
  message = "Are you sure you want to leave? You may have unsaved changes.",
  context
}: {
  shouldBlock: boolean;
  shouldBlockNavigation?: ShouldBlockFn;
  message: string;
  context: BatchContext;
}): TNavigationBlockerReturn => {
  const { clearAllPendingChanges } = useBatchModeActions();
  const blockerFn: ShouldBlockFn = useCallback(
    async (args) => {
      if (!shouldBlock) return false;
      if (shouldBlockNavigation && !(await shouldBlockNavigation(args))) return false;

      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(message);
      if (confirmed) {
        clearAllPendingChanges(context);
      }

      return !confirmed;
    },
    [shouldBlock, shouldBlockNavigation, message, context, clearAllPendingChanges]
  );

  useBlocker({
    shouldBlockFn: blockerFn,
    disabled: !shouldBlock,
    enableBeforeUnload: shouldBlock
  });

  return {
    isBlocked: shouldBlock
  };
};
