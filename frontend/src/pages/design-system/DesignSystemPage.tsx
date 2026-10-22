import { startTransition, Suspense, useEffect, useRef, useState } from "react";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { type ComponentGroup } from "@app/components/v4/contracts/types";
import { V4Scope } from "@app/components/v4/scope";
import tokens from "@app/components/v4/tokens.json";
import { Button } from "@app/components/v4/ui/button";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Sidebar } from "@app/components/v4/ui/sidebar";
import { AppInset, AppShell, scrollInsetTo, TopBar } from "@app/components/v4/ui/top-bar";

import { AccentPanelButton, AccentPanelProvider, useAccentPanel } from "./accent-panel";
import { ComparisonPageView } from "./ComparisonPages";
import { ComponentPreviewPage } from "./ComponentPreviewPage";
import { ColorPage, OverviewPage, SpacingShapePage, TypographyPage } from "./FoundationPages";
import { MotionPage } from "./InteractionPages";
import {
  comparisonPages,
  componentPages,
  type DocumentationPage,
  foundationPages,
  guidancePages,
  resolveDocumentationPage
} from "./navigation";
import { RulesPage } from "./RulesPage";
import { WorkbenchPalette } from "./workbench-palette";

import "@app/components/v4/v4.css";
import dockStyles from "./dock.module.css";

const pullRequest = "https://github.com/Infisical/infisical/pull/8753";
const documentation = "https://infisical.com/docs";
const openLink = (href: string) => {
  if (href.startsWith("#")) window.location.hash = href;
  else window.open(href, "_blank", "noreferrer");
};

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
    case "button":
      return (
        <>
          <div className="mb-4 flex justify-end">
            <AccentPanelButton />
          </div>
          <ComponentPreviewPage page={page} />
        </>
      );
    default:
      if (page.startsWith("compare-"))
        return <ComparisonPageView page={page as (typeof comparisonPages)[number]["id"]} />;
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
  "Composites",
  "Patterns",
  "Code",
  "Utilities"
];
const groupIcons: Record<string, IconName> = {
  Foundations: "apps",
  Actions: "plus",
  Forms: "file",
  Navigation: "menu",
  "Data display": "inbox",
  Feedback: "bell",
  Overlays: "folder-open",
  Composites: "building",
  Patterns: "sync",
  Code: "terminal",
  Utilities: "settings",
  Comparisons: "eye",
  Contributing: "user"
};
const navigationGroups = [
  { title: "Foundations", pages: foundationPages },
  ...componentGroupOrder.map((title) => ({
    title,
    pages: componentPages.filter((page) => page.group === title)
  })),
  { title: "Comparisons", pages: comparisonPages },
  { title: "Contributing", pages: guidancePages }
].map((group) => ({ ...group, icon: groupIcons[group.title] ?? "file" }));
const sidebarSections = navigationGroups.map((group) => ({
  label: group.title,
  icon: group.icon,
  items: group.pages.map((page) => ({ id: page.id, label: page.title, href: `#${page.id}` }))
}));
const groupOf = (page: string) =>
  navigationGroups.find((group) => group.pages.some((entry) => entry.id === page));

const DockAccentButton = () => {
  const panel = useAccentPanel();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={dockStyles.segment}
      aria-label="Open the accent picker"
      onClick={panel?.open}
    >
      <span
        aria-hidden
        className="inline-block size-3 border border-border"
        style={{ background: "var(--v4-accent)" }}
      />
      Accent
    </Button>
  );
};

export const DesignSystemPage = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState<number>();
  const { resolvedTheme: hostTheme } = useTheme();
  const [themeChoice, setTheme] = useState<"light" | "dark" | "system">(hostTheme);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const theme = themeChoice === "system" ? systemTheme : themeChoice;
  const [corners, setCorners] = useState<"square" | "soft">(() => {
    try {
      return window.localStorage.getItem("v4-corners") === "soft" ? "soft" : "square";
    } catch {
      return "square";
    }
  });
  const nextCorners = corners === "soft" ? "square" : "soft";
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
  const example = hash.split("/")[1];
  useEffect(() => {
    if (!example) return undefined;
    const started = performance.now();
    let frame = 0;
    const seek = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-component="${currentPage}"][data-example="${example}"]`
      );
      if (target) scrollInsetTo(target);
      else if (performance.now() - started < 3000) frame = requestAnimationFrame(seek);
    };
    frame = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(frame);
  }, [currentPage, example]);
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <V4Scope className="flex h-dvh flex-col overflow-clip" theme={theme} corners={corners}>
      <AccentPanelProvider>
        <a href={`#${currentPage}`} className="sr-only focus:not-sr-only focus:p-3">
          Skip to content
        </a>
        <AppShell>
          <Sidebar
            label="Design system"
            user={{
              name: "Infisical 2.0 workbench",
              email: "",
              meta: `Design system v${tokens.version}`,
              media: <Icon name="apps" />,
              items: [
                { label: "Overview", icon: "home", onSelect: () => openLink("#overview") },
                { label: "Rules", icon: "file", onSelect: () => openLink("#rules") },
                { type: "separator" },
                {
                  label: "Pull request on GitHub",
                  icon: "external",
                  onSelect: () => openLink(pullRequest)
                },
                {
                  label: "Documentation",
                  icon: "external",
                  onSelect: () => openLink(documentation)
                }
              ]
            }}
            theme={{
              value: themeChoice === "system" ? "system" : theme,
              onChange: setTheme
            }}
            sections={sidebarSections}
            current={currentPage}
            search={{ onClick: () => setPaletteOpen(true), label: "Search the design system" }}
          />
          <AppInset>
            <TopBar
              breadcrumb={[
                { label: "Design system", href: "#overview" },
                ...(groupOf(currentPage) ? [{ label: groupOf(currentPage)?.title ?? "" }] : []),
                {
                  label:
                    groupOf(currentPage)?.pages.find((entry) => entry.id === currentPage)?.title ??
                    currentPage
                }
              ]}
              search={{ onClick: () => setPaletteOpen(true), label: "Search" }}
            />
            <Suspense
              fallback={
                <p role="status" className="px-4 pt-5 text-sm lg:px-10 lg:pt-8">
                  Loading examples
                </p>
              }
            >
              <div
                key={currentPage}
                id={currentPage}
                data-document-view="human"
                tabIndex={-1}
                className="min-w-0 flex-1 px-4 pt-5 outline-none lg:px-10 lg:pt-8"
                style={{
                  marginBottom: `calc(${dockHeight === undefined ? "var(--v4-space-48)" : `${dockHeight}px`} + ${dockInset} + var(--v4-space-8))`
                }}
              >
                <article className="mx-auto max-w-[56rem] pb-8">
                  <PageContent page={currentPage} />
                </article>
              </div>
            </Suspense>
          </AppInset>
        </AppShell>
        <WorkbenchPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          groups={navigationGroups}
          toggleTheme={() => setTheme(nextTheme)}
          toggleCorners={() => {
            try {
              window.localStorage.setItem("v4-corners", nextCorners);
            } catch {
              // Storage is unavailable; keep the choice for this session only.
            }
            setCorners(nextCorners);
          }}
        />
        <div
          data-documentation-dock
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: `calc(${dockInset})` }}
        >
          <div ref={dock} className={dockStyles.dock}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={dockStyles.segment}
              aria-label={`Corners: ${corners}. Switch to ${nextCorners}`}
              onClick={() => {
                try {
                  window.localStorage.setItem("v4-corners", nextCorners);
                } catch {
                  // Storage is unavailable; keep the choice for this session only.
                }
                setCorners(nextCorners);
              }}
            >
              {corners === "soft" ? "Soft" : "Square"}
            </Button>
            <DockAccentButton />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={dockStyles.segment}
              iconOnly
              onClick={() => setTheme(nextTheme)}
              aria-label={`Switch to ${nextTheme} theme`}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </Button>
          </div>
        </div>
      </AccentPanelProvider>
    </V4Scope>
  );
};
