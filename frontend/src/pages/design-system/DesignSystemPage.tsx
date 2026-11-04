import { startTransition, Suspense, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { V4Scope } from "@app/components/v4/scope";
import tokens from "@app/components/v4/tokens.json";
import { type BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Loader } from "@app/components/v4/ui/loader";
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
import { ColorPage, SpacingShapePage, TypographyPage } from "./FoundationPages";
import { MotionPage } from "./InteractionPages";
import {
  comparisonPages,
  componentGroupOrder,
  componentPages,
  type DocumentationPage,
  documentationPages,
  foundationPages,
  resolveDocumentationPage,
  workbenchSections
} from "./navigation";
import { OverviewPage } from "./OverviewPage";
import { RulesPage } from "./RulesPage";
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
  Comparisons: "eye"
};
const navigationGroups = [
  { title: "Foundations", pages: foundationPages },
  ...componentGroupOrder.map((title) => ({
    title,
    pages: componentPages.filter((page) => page.group === title)
  })),
  { title: "Comparisons", pages: comparisonPages }
].map((group) => ({ ...group, icon: groupIcons[group.title] ?? "file" }));
const sidebarSections = navigationGroups.map((group) => ({
  label: group.title,
  icon: group.icon,
  items: group.pages.map((page) => ({ id: page.id, label: page.title, href: `#${page.id}` }))
}));

const goTo = (page: string) => {
  window.location.hash = `#${page}`;
};

const workbenchCrumbs = (currentPage: DocumentationPage): BreadcrumbCrumb[] => {
  const category =
    workbenchSections.find((entry) => entry.pages.some((page) => page.id === currentPage)) ??
    workbenchSections[0];
  const group = category.pages.find((page) => page.id === currentPage)?.group;
  const groupPages = category.pages.filter((page) => group && page.group === group);
  const pageOf = (id: string) => (id === currentPage ? {} : { href: `#${id}` });
  return [
    {
      label: category.title,
      media: <Icon name={category.icon} />,
      ...pageOf(category.pages[0].id),
      switcher: {
        label: "Switch category",
        options: workbenchSections.map((entry) => ({
          value: entry.id,
          label: entry.title,
          media: <Icon name={entry.icon} />
        })),
        value: category.id,
        onChange: (value) =>
          goTo(workbenchSections.find((entry) => entry.id === value)?.pages[0]?.id ?? "overview")
      }
    },
    ...(group
      ? [
          {
            label: group,
            ...pageOf(groupPages[0].id),
            switcher: {
              label: "Switch page",
              placeholder: `Search ${group.toLowerCase()}`,
              options: groupPages.map((page) => ({ value: page.id, label: page.title })),
              value: currentPage,
              onChange: goTo
            }
          }
        ]
      : []),
    { label: documentationPages.find((page) => page.id === currentPage)?.title ?? currentPage }
  ];
};

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
  // RowLink navigates through the router, which updates its state before the URL and fires no hashchange.
  const routerHash = useRouterState({ select: (state) => state.location.hash });
  useEffect(() => {
    if (routerHash) startTransition(() => setHash(`#${routerHash}`));
  }, [routerHash]);
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
    <V4Scope className="flex h-dvh flex-col overflow-clip" theme={theme}>
      <AccentPanelProvider>
        <a href={`#${currentPage}`} className="sr-only focus:not-sr-only focus:p-3">
          Skip to content
        </a>
        <AppShell>
          <WorkbenchBar
            breadcrumb={workbenchCrumbs(currentPage)}
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
              theme: { value: themeChoice, onChange: setTheme }
            }}
          />
          <Sidebar label="Design system" sections={sidebarSections} current={currentPage} />
          <AppInset>
            <Suspense
              fallback={
                <Loader
                  size="page"
                  label={`Loading ${documentationPages.find((page) => page.id === currentPage)?.title ?? "the page"}`}
                />
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
    </V4Scope>
  );
};
