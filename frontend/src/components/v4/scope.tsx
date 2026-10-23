import * as React from "react";
import { createPortal } from "react-dom";
import { MotionConfig } from "motion/react";

import { watchScrollEdges } from "./lib/scroll-edges";
import { cn } from "./lib/utils";

type Theme = "light" | "dark";
export type V4Corners = "square" | "soft";
const PortalContainerContext = React.createContext<HTMLElement | null | undefined>(undefined);
const ThemeContext = React.createContext<Theme | undefined>(undefined);
const CornersContext = React.createContext<V4Corners | undefined>(undefined);

export const useV4PortalContainer = () => React.useContext(PortalContainerContext);
export const useV4Theme = () => React.useContext(ThemeContext);

function inheritedTheme(node: HTMLElement, fallback: Theme | undefined): Theme {
  let ancestor = node.parentElement;
  while (ancestor) {
    const value = ancestor.getAttribute("data-theme");
    if (value === "light" || value === "dark") return value;
    ancestor = ancestor.parentElement;
  }
  return fallback ?? "light";
}

export function V4Scope({
  children,
  className,
  theme,
  corners: cornersProp,
  ref: forwardedRef,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { theme?: Theme; corners?: V4Corners } & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  const parentTheme = useV4Theme();
  const parentCorners = React.useContext(CornersContext);
  const corners = cornersProp ?? parentCorners ?? "square";
  const [wrapper, setWrapper] = React.useState<HTMLDivElement | null>(null);
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const [inherited, setInherited] = React.useState<Theme>();
  const resolvedTheme = theme ?? inherited ?? parentTheme ?? "light";
  const assignWrapper = React.useCallback(
    (node: HTMLDivElement | null) => {
      setWrapper(node);
      if (typeof forwardedRef === "function") forwardedRef(node);
      else {
        const targetRef = forwardedRef;
        if (targetRef) targetRef.current = node;
      }
    },
    [forwardedRef]
  );
  React.useEffect(() => watchScrollEdges(), []);
  React.useLayoutEffect(() => {
    if (!wrapper || theme !== undefined) return undefined;
    const update = () => setInherited(inheritedTheme(wrapper, parentTheme));
    update();
    const observer = new MutationObserver(update);
    let ancestor = wrapper.parentElement;
    while (ancestor) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ["data-theme"] });
      ancestor = ancestor.parentElement;
    }
    return () => observer.disconnect();
  }, [wrapper, theme, parentTheme]);

  return (
    <MotionConfig reducedMotion="user">
      <ThemeContext value={resolvedTheme}>
        <CornersContext value={corners}>
          <PortalContainerContext value={container}>
            <div
              {...props}
              ref={assignWrapper}
              className={cn("v4", className)}
              data-corners={corners === "soft" ? "soft" : "sharp"}
              data-theme={resolvedTheme}
            >
              {children}
            </div>
            {createPortal(
              <div
                ref={setContainer}
                className="v4"
                data-corners={corners === "soft" ? "soft" : "sharp"}
                data-theme={resolvedTheme}
              />,
              document.body
            )}
          </PortalContainerContext>
        </CornersContext>
      </ThemeContext>
    </MotionConfig>
  );
}
V4Scope.displayName = "V4Scope";
