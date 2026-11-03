import { startTransition, Suspense, useEffect, useMemo, useState } from "react";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { type ComponentGroup } from "@app/components/v4/contracts/types";
import { V4Scope } from "@app/components/v4/scope";
import tokens from "@app/components/v4/tokens.json";
import { type IconName } from "@app/components/v4/ui/icon";
import { Sidebar } from "@app/components/v4/ui/sidebar";
import {
  AppInset,
  AppShell,
  PageGutter,
  scrollInsetTo,
  TopBar,
  type TopBarAccount,
  type TopBarProps
} from "@app/components/v4/ui/top-bar";
import "@app/components/v4/v4.css";

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
import { WorkbenchContext } from "./workbench-context";
import { WorkbenchPalette } from "./workbench-palette";

const pullRequest = "https://github.com/Infisical/infisical/pull/8753";
const documentation = "https://infisical.com/docs";
const openLink = (href: string) => {
  if (href.startsWith("#")) window.location.hash = href;
  else window.open(href, "_blank", "noreferrer");
};

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

const WorkbenchBar = (props: Omit<TopBarProps, "account"> & { account: TopBarAccount }) => {
  const accent = useAccentPanel();
  return (
    <TopBar
      {...props}
      account={{
        ...props.account,
        endItems: accent ? [{ label: "Accent", icon: "sun", onSelect: accent.open }] : []
      }}
    />
  );
};

export const DesignSystemPage = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);
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
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const follow = () => startTransition(() => setHash(window.location.hash));
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
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
  const workbench = useMemo(
    () => ({
      theme: { value: themeChoice, onChange: setTheme },
      openSearch: () => setPaletteOpen(true)
    }),
    [themeChoice]
  );
  return (
    <V4Scope className="flex h-dvh flex-col overflow-clip" theme={theme}>
      <WorkbenchContext value={workbench}>
        <AccentPanelProvider>
          <a href={`#${currentPage}`} className="sr-only focus:not-sr-only focus:p-3">
            Skip to content
          </a>
          <AppShell>
            <WorkbenchBar
              breadcrumb={[
                { label: "Design system", href: "#overview" },
                ...(groupOf(currentPage) ? [{ label: groupOf(currentPage)?.title ?? "" }] : []),
                {
                  label:
                    groupOf(currentPage)?.pages.find((entry) => entry.id === currentPage)?.title ??
                    currentPage
                }
              ]}
              search={{ onClick: () => setPaletteOpen(true), label: "Search the design system" }}
              account={{
                label: "Workbench",
                name: "Infisical 2.0 workbench",
                email: `Design system v${tokens.version}`,
                items: [
                  { label: "Overview", icon: "home", onSelect: () => openLink("#overview") },
                  { label: "Rules", icon: "file", onSelect: () => openLink("#rules") },
                  { type: "separator" },
                  {
                    label: "Pull request on GitHub",
                    icon: "git",
                    href: pullRequest,
                    external: true
                  },
                  { label: "Documentation", icon: "file", href: documentation, external: true }
                ],
                theme: workbench.theme
              }}
            />
            <Sidebar label="Design system" sections={sidebarSections} current={currentPage} />
            <AppInset>
              <Suspense
                fallback={
                  <PageGutter>
                    <p role="status" className="text-sm">
                      Loading examples
                    </p>
                  </PageGutter>
                }
              >
                <div
                  key={currentPage}
                  id={currentPage}
                  data-document-view="human"
                  tabIndex={-1}
                  className="min-w-0 flex-1 outline-none"
                >
                  <PageGutter>
                    <article>
                      <PageContent page={currentPage} />
                    </article>
                  </PageGutter>
                </div>
              </Suspense>
            </AppInset>
            <WorkbenchPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              groups={navigationGroups}
              toggleTheme={() => setTheme(nextTheme)}
            />
          </AppShell>
        </AccentPanelProvider>
      </WorkbenchContext>
    </V4Scope>
  );
};
