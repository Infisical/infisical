import { createContext, useContext, useEffect } from "react";

type AppConnectionFormContextValue = {
  /**
   * Closes the surrounding Sheet. Used by each provider form's Cancel button so the footer does not
   * have to thread a prop through every form and the ~130 render sites in AppConnectionForm.
   */
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
};

const AppConnectionFormContext = createContext<AppConnectionFormContextValue>({
  onCancel: () => {}
});

export const AppConnectionFormProvider = AppConnectionFormContext.Provider;

export const useAppConnectionForm = () => useContext(AppConnectionFormContext);

export const useAppConnectionFormDirtyState = (isDirty: boolean) => {
  const { onDirtyChange } = useAppConnectionForm();

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
};
