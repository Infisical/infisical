import { createContext, useContext } from "react";

import type { ShellTheme } from "@app/components/v4/ui/top-bar";

export const WorkbenchContext = createContext<{
  theme: { value: ShellTheme; onChange: (value: ShellTheme) => void };
  openSearch: () => void;
} | null>(null);

export const useWorkbench = () => useContext(WorkbenchContext);
