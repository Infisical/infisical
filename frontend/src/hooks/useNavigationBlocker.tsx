import { useCallback } from "react";
import { useBlocker } from "@tanstack/react-router";

type TNavigationBlockerReturn = {
  isBlocked: boolean;
};

export const useNavigationBlocker = (
  shouldBlock: boolean,
  message: string = "Are you sure you want to leave? You may have unsaved changes."
): TNavigationBlockerReturn => {
  const blockerFn = useCallback(() => {
    if (!shouldBlock) return false;

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(message);

    return !confirmed;
  }, [shouldBlock, message]);

  useBlocker(blockerFn);

  return {
    isBlocked: shouldBlock
  };
};
