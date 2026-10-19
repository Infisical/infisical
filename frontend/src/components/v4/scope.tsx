import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { MotionConfig } from "motion/react";

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

export const V4Scope = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { theme?: Theme; corners?: V4Corners }
>(({ children, className, theme, corners: cornersProp, ...props }, forwardedRef) => {
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
      <ThemeContext.Provider value={resolvedTheme}>
        <CornersContext.Provider value={corners}>
          <PortalContainerContext.Provider value={container}>
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
          </PortalContainerContext.Provider>
        </CornersContext.Provider>
      </ThemeContext.Provider>
    </MotionConfig>
  );
});
V4Scope.displayName = "V4Scope";
