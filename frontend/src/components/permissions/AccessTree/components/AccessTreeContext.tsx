import React, {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useMemo,
  useState
} from "react";

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

export const AccessTreeProvider: React.FC<AccessTreeProviderProps> = ({ children }) => {
  const [secretName, setSecretName] = useState("");
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

  return <AccessTreeContext.Provider value={value}>{children}</AccessTreeContext.Provider>;
};

export const useAccessTreeContext = (): AccessTreeContextProps => {
  const context = useContext(AccessTreeContext);

  if (!context) {
    throw new Error("useAccessTreeContext must be used within a AccessTreeProvider");
  }

  return context;
};
