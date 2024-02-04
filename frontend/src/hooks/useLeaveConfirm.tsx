import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import { leaveConfirmDefaultMessage } from "@app/const";

type LeaveConfirmProps = {
  initialValue: boolean;
  message?: string;
};

interface LeaveConfirmReturn {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
}

export function useLeaveConfirm({
  initialValue,
  message = leaveConfirmDefaultMessage
}: LeaveConfirmProps): LeaveConfirmReturn {
  const router = useRouter();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(initialValue);

  const onRouteChangeStart = useCallback(() => {
    if (hasUnsavedChanges) {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) {
        return true;
      }
      throw new Error("Abort route change by user's confirmation.");
    }
    return false;
  }, [hasUnsavedChanges]);

  const handleWindowClose = useCallback(
    (e: any) => {
      if (!hasUnsavedChanges) {
        return;
      }
      e.preventDefault();
      e.returnValue = message;
    },
    [hasUnsavedChanges]
  );

  useEffect(() => {
    router.events.on("routeChangeStart", onRouteChangeStart);
    window.addEventListener("beforeunload", handleWindowClose);

    return () => {
      router.events.off("routeChangeStart", onRouteChangeStart);
      window.removeEventListener("beforeunload", handleWindowClose);
    };
  }, [onRouteChangeStart, handleWindowClose]);

  return {
    hasUnsavedChanges,
    setHasUnsavedChanges
  };
}
