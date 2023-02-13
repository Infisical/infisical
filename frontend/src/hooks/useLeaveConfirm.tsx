import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import { leaveConfirmDefaultMessage } from '@app/const';

type LeaveConfirmProps = {
    initialValue: boolean,
    message?: string
}

interface LeaveConfirmReturn {
  hasUnsavedChanges: boolean,
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>,  
}

export function useLeaveConfirm({
    initialValue,
    message = leaveConfirmDefaultMessage,
}: LeaveConfirmProps): LeaveConfirmReturn {
  const router = useRouter()
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(initialValue);

  const onRouteChangeStart = useCallback(() => {
    if (hasUnsavedChanges) {
      if (confirm(message)) {
        return true
      }
      throw "Abort route change by user's confirmation."
    }
  }, [hasUnsavedChanges])

  const handleWindowClose = useCallback((e: any) => {
    if (!hasUnsavedChanges) { 
      return;
    }
    e.preventDefault();
    e.returnValue = message;
  });

  useEffect(() => {
    router.events.on("routeChangeStart", onRouteChangeStart);
    window.addEventListener('beforeunload', handleWindowClose);

    return () => {
      router.events.off("routeChangeStart", onRouteChangeStart);
      window.removeEventListener('beforeunload', handleWindowClose);
    }
  }, [onRouteChangeStart, handleWindowClose]);

  return {
    hasUnsavedChanges,
    setHasUnsavedChanges,
  };
}
