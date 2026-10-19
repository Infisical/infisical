import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  initializeTheme,
  ThemeProvider
} from "@app/components/v3/platform/ThemeProvider/ThemeProvider";

import { DesignSystemPage } from "./DesignSystemPage";

import "../../index.css";

initializeTheme();
const root = document.getElementById("root");
if (!root) throw new Error("Workbench root is missing");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider pathname="/design-system">
      <DesignSystemPage />
    </ThemeProvider>
  </StrictMode>
);
