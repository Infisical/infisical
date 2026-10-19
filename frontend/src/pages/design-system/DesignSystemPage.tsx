import { startTransition, Suspense, useEffect, useRef, useState } from "react";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { type ComponentGroup } from "@app/components/v4/contracts/types";
import { V4Scope } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger
} from "@app/components/v4/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import logo from "./assets/infisical-logo.svg";
import { AgentPage } from "./AgentPage";
import { ComponentPreviewPage } from "./ComponentPreviewPage";
import { ColorPage, OverviewPage, SpacingShapePage, TypographyPage } from "./FoundationPages";
import { MotionPage } from "./InteractionPages";
import {
  componentPages,
  type DocumentationPage,
  foundationPages,
  guidancePages,
  resolveDocumentationPage
} from "./navigation";
import { RulesPage } from "./RulesPage";

import "@app/components/v4/v4.css";
import dockStyles from "./dock.module.css";

const dockInset = "var(--v4-space-16) + env(safe-area-inset-bottom)";

const PageContent = ({ page }: { page: DocumentationPage }) => {
  switch (page) {
    case "overview":
      return <OverviewPage />;
    case "colors":
      return <ColorPage />;
    case "typography":
      return <TypographyPage />;
    case "spacing-shape":
      return <SpacingShapePage />;
    case "motion":
      return <MotionPage />;
    case "rules":
      return <RulesPage />;
    default:
      return <ComponentPreviewPage page={page} />;
  }
};

const componentGroupOrder: readonly ComponentGroup[] = [
  "Actions",
  "Forms",
  "Navigation",
  "Data display",
  "Feedback",
  "Overlays",
  "Code",
  "Utilities"
];
const navigationGroups = [
  { title: "Foundations", pages: foundationPages },
  ...componentGroupOrder.map((title) => ({
    title,
    pages: componentPages.filter((page) => page.group === title)
  })),
  { title: "Contributing", pages: guidancePages }
];

const Brand = ({ theme, onSelect }: { theme: "light" | "dark"; onSelect?: () => void }) => (
  <a
    href="#overview"
    onClick={onSelect}
    aria-label="Infisical 2.0 overview"
    className="flex w-fit items-center gap-2 text-sm font-medium"
  >
    <img
      src={logo}
      width={126}
      height={20}
      alt="Infisical"
      style={{ filter: theme === "dark" ? "invert(1)" : undefined }}
    />
    <span>2.0</span>
  </a>
);

const DocumentationNavigation = ({
  currentPage,
  onSelect
}: {
  currentPage: string;
  onSelect?: () => void;
}) => (
  <nav aria-label="Design system">
    {navigationGroups.map((group) => (
      <div key={group.title} className="mb-7">
        <p className="text-muted-foreground mb-2 px-2 text-xs font-medium">{group.title}</p>
        <ul className="space-y-0.5">
          {group.pages.map((page) => (
            <li key={page.id}>
              <a
                href={`#${page.id}`}
                onClick={onSelect}
                aria-current={page.id === currentPage ? "page" : undefined}
                className={`flex min-h-8 items-center rounded-md px-2 text-sm hover:bg-sidebar-accent ${page.id === currentPage ? "bg-sidebar-accent font-medium text-sidebar-foreground" : "text-muted-foreground"}`}
              >
                {page.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </nav>
);

export const DesignSystemPage = () => {
  const [view, setView] = useState<"human" | "agent">("human");
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavigation = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState<number>();
  const { resolvedTheme: theme, setTheme } = useTheme();
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const follow = () => startTransition(() => setHash(window.location.hash));
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  useEffect(() => {
    const control = dock.current;
    if (!control) return undefined;
    const measure = () => setDockHeight(control.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(control);
    return () => observer.disconnect();
  }, []);
  const currentPage = resolveDocumentationPage(hash);
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <V4Scope className="flex h-svh flex-col overflow-hidden" theme={theme}>
      <a href={`#${currentPage}`} className="sr-only focus:not-sr-only focus:p-3">
        Skip to content
      </a>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="shrink-0 px-6 pt-7 pb-6">
            <Brand theme={theme} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <DocumentationNavigation currentPage={currentPage} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-4 pt-3 lg:hidden">
            <Brand theme={theme} />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  iconOnly
                  icon="menu"
                  aria-label="Open documentation navigation"
                />
              </SheetTrigger>
              <SheetContent
                ref={mobileNavigation}
                side="left"
                style={{ width: "min(18rem, calc(100vw - var(--v4-space-32)))" }}
                onOpenAutoFocus={(event) => {
                  const current =
                    mobileNavigation.current?.querySelector<HTMLAnchorElement>(
                      'a[aria-current="page"]'
                    );
                  if (current) {
                    event.preventDefault();
                    current.focus();
                  }
                }}
              >
                <SheetTitle className="sr-only">Documentation navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  Browse foundations, components and contribution guidance.
                </SheetDescription>
                <div className="shrink-0 px-6 pt-7 pb-2">
                  <Brand theme={theme} onSelect={() => setMobileOpen(false)} />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                  <DocumentationNavigation
                    currentPage={currentPage}
                    onSelect={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Suspense
            fallback={
              <p role="status" className="px-4 pt-5 text-sm lg:px-10 lg:pt-8">
                Loading examples
              </p>
            }
          >
            <main
              key={currentPage}
              id={currentPage}
              data-document-view={view}
              tabIndex={-1}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pt-5 outline-none lg:px-10 lg:pt-8"
              style={{
                marginBottom: `calc(${dockHeight === undefined ? "var(--v4-space-48)" : `${dockHeight}px`} + ${dockInset} + var(--v4-space-8))`
              }}
            >
              <article className="mx-auto max-w-[56rem] pb-8">
                {view === "human" ? (
                  <PageContent page={currentPage} />
                ) : (
                  <div className="max-w-[40rem]">
                    <AgentPage key={currentPage} page={currentPage} />
                  </div>
                )}
              </article>
            </main>
          </Suspense>
        </div>
      </div>
      <div
        data-documentation-dock
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: `calc(${dockInset})` }}
      >
        <div ref={dock} className={dockStyles.dock}>
          <ToggleGroup
            type="single"
            value={view}
            size="sm"
            bare
            aria-label="Documentation view"
            onValueChange={(mode) => {
              if (mode === "human" || mode === "agent") setView(mode);
            }}
          >
            <ToggleGroupItem value="human">Human</ToggleGroupItem>
            <ToggleGroupItem value="agent">Agent</ToggleGroupItem>
          </ToggleGroup>
          <span aria-hidden="true" className={dockStyles.divider} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={dockStyles.segment}
            iconOnly
            onClick={() => setTheme(nextTheme, "design-system")}
            aria-label={`Switch to ${nextTheme} theme`}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </Button>
        </div>
      </div>
    </V4Scope>
  );
};
