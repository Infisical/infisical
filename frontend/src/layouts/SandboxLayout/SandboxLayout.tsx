import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";

// Sandbox has no scope colour of its own: like PAM, it repaints the shared `project` token for the
// whole product so scope-aware components pick it up without special-casing.
const SANDBOX_PROJECT_COLOR = "#f4f4f5";

export const SandboxLayout = () => {
  useEffect(() => {
    // Set on the document rather than this subtree: Sheets, Selects and Dropdowns render through
    // portals attached to <body>, so a subtree override would leave them on the default yellow.
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--color-project");

    root.style.setProperty("--color-project", SANDBOX_PROJECT_COLOR);
    return () => {
      if (previous) root.style.setProperty("--color-project", previous);
      else root.style.removeProperty("--color-project");
    };
  }, []);

  return (
    // No scroll container of its own. Sandbox routes have no projectId, so the organization layout
    // already scrolls the content area for them; a second one here captured the scroll and left the
    // page itself unscrollable with the scrollbar in the wrong place.
    <Outlet />
  );
};
