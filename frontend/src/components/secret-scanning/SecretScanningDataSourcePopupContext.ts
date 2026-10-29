import { createContext, useCallback, useRef } from "react";

export const SecretScanningDataSourcePopupContext = createContext<
  ((id: string, open: boolean) => void) | null
>(null);

export const useSecretScanningDataSourcePopupRegistry = () => {
  const openPopups = useRef(new Set<string>());

  const onPopupOpenChange = useCallback((id: string, open: boolean) => {
    if (open) {
      openPopups.current.add(id);
    } else {
      openPopups.current.delete(id);
    }
  }, []);

  const onEscapeKeyDown = useCallback((event: KeyboardEvent) => {
    if (openPopups.current.size) event.preventDefault();
  }, []);

  return { onPopupOpenChange, onEscapeKeyDown };
};
