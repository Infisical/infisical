import React, {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useMemo,
  useState
} from "react";
import { FormProvider, useForm } from "react-hook-form";

import { ViewMode } from "../types";

export interface AccessTreeContextProps {
  secretName: string;
  setSecretName: Dispatch<SetStateAction<string>>;
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
}

const AccessTreeContext = createContext<AccessTreeContextProps | undefined>(undefined);

interface AccessTreeProviderProps {
  children: ReactNode;
}

export type AccessTreeForm = { metadata: { key: string; value: string }[] };

export const AccessTreeProvider: React.FC<AccessTreeProviderProps> = ({ children }) => {
  const [secretName, setSecretName] = useState("");
  const formMethods = useForm<AccessTreeForm>({ defaultValues: { metadata: [] } });
  const [viewMode, setViewMode] = useState(ViewMode.Docked);

  const value = useMemo(
    () => ({
      secretName,
      setSecretName,
      viewMode,
      setViewMode
    }),
    [secretName, setSecretName, viewMode, setViewMode]
  );

  return (
    <FormProvider {...formMethods}>
      <AccessTreeContext.Provider value={value}>{children}</AccessTreeContext.Provider>
    </FormProvider>
  );
};

export const useAccessTreeContext = (): AccessTreeContextProps => {
  const context = useContext(AccessTreeContext);

  if (!context) {
    throw new Error("useAccessTreeContext must be used within a AccessTreeProvider");
  }

  return context;
};
