import * as React from "react";
import { createPortal } from "react-dom";
import { MotionConfig } from "motion/react";

import { watchScrollEdges } from "./lib/scroll-edges";
import { cn } from "./lib/utils";

type Theme = "light" | "dark";
const PortalContainerContext = React.createContext<HTMLElement | null | undefined>(undefined);
const ThemeContext = React.createContext<Theme | undefined>(undefined);
const CollisionBoundaryContext = React.createContext<HTMLElement | undefined>(undefined);

export const useV4PortalContainer = () => React.useContext(PortalContainerContext);
export const useV4CollisionBoundary = () => React.useContext(CollisionBoundaryContext);
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
  portalContainer,
  ref: forwardedRef,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  theme?: Theme;
  portalContainer?: HTMLElement | null;
} & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  const parentTheme = useV4Theme();
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
  const appliedTheme = React.useRef(resolvedTheme);
  React.useLayoutEffect(() => {
    if (appliedTheme.current === resolvedTheme) return undefined;
    appliedTheme.current = resolvedTheme;
    const scopes = [wrapper, container].filter((node): node is HTMLDivElement => Boolean(node));
    scopes.forEach((node) => node.setAttribute("data-theme-switching", ""));
    scopes.forEach((node) => getComputedStyle(node).transitionProperty);
    const frame = requestAnimationFrame(() =>
      scopes.forEach((node) => node.removeAttribute("data-theme-switching"))
    );
    return () => {
      cancelAnimationFrame(frame);
      scopes.forEach((node) => node.removeAttribute("data-theme-switching"));
    };
  }, [resolvedTheme, wrapper, container]);
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
        <PortalContainerContext value={container}>
          <CollisionBoundaryContext value={portalContainer ?? undefined}>
            <div
              {...props}
              ref={assignWrapper}
              className={cn("v4", className)}
              data-theme={resolvedTheme}
            >
              {children}
            </div>
            {portalContainer !== null &&
              createPortal(
                <div ref={setContainer} className="v4" data-theme={resolvedTheme} />,
                portalContainer ?? document.body
              )}
          </CollisionBoundaryContext>
        </PortalContainerContext>
      </ThemeContext>
    </MotionConfig>
  );
}
V4Scope.displayName = "V4Scope";
