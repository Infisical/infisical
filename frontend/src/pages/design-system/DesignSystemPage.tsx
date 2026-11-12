import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useMatches, useNavigate, useRouterState } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { componentCatalog } from "@app/components/v4/catalog";
import { defaultV4Theme, toV4Theme, v4ThemeScheme } from "@app/components/v4/lib/theme-registry";
import type { V4Scheme } from "@app/components/v4/lib/themes";
import { V4Scope } from "@app/components/v4/scope";
import tokens from "@app/components/v4/tokens.json";
import { type BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Icon } from "@app/components/v4/ui/icon";
import { Sidebar, type SidebarLevel } from "@app/components/v4/ui/sidebar";
import {
  AppInset,
  AppShell,
  PageGutter,
  scrollInsetTo,
  TopBar,
  type TopBarAccount,
  type TopBarProps
} from "@app/components/v4/ui/top-bar";
import { V4RouterProvider } from "@app/pages/v4/cipher-router";
import "@app/components/v4/v4.css";

import { AccentPanelProvider, useAccentPanel } from "./accent-panel";
import {
  componentGroupOrder,
  groupIcons,
  groupSlug,
  legacyHashLink,
  pagesIn,
  routePage,
  type WorkbenchPage,
  workbenchCategories,
  workbenchPage
} from "./navigation";
import { WorkbenchPalette } from "./workbench-palette";

const pullRequest = "https://github.com/Infisical/infisical/pull/8753";
const documentation = "https://infisical.com/docs";

const pageItem = (page: WorkbenchPage) => ({ id: page.id, label: page.title, link: page.link });
const levelSections = (category: (typeof workbenchCategories)[number]) =>
  category.id === "components"
    ? componentGroupOrder
        .filter((group) => group !== "Patterns")
        .map((group) => ({
          label: group,
          icon: groupIcons[group],
          items: pagesIn("components", groupSlug(group)).map(pageItem)
        }))
    : [{ label: category.title, icon: category.icon, items: pagesIn(category.id).map(pageItem) }];
const [overviewCategory, ...categories] = workbenchCategories;
const sidebarLevels: SidebarLevel[] = [
  {
    id: "design-system",
    label: "Design system",
    sections: [
      {
        items: [
          {
            id: "overview",
            label: overviewCategory.title,
            icon: overviewCategory.icon,
            link: workbenchPage("overview").link
          },
          ...categories.map((category) => ({
            id: `category-${category.id}`,
            label: category.title,
            icon: category.icon,
            level: category.id
          }))
        ]
      }
    ]
  },
  ...categories.map((category) => ({
    id: category.id,
    label: category.title,
    parent: "design-system",
    sections: levelSections(category)
  }))
];

const paletteGroups = [
  {
    title: "Foundations",
    icon: "apps" as const,
    pages: [...pagesIn("overview"), ...pagesIn("foundations")]
  },
  ...componentGroupOrder.map((group) => ({
    title: group,
    icon: groupIcons[group],
    pages: group === "Patterns" ? pagesIn("patterns") : pagesIn("components", groupSlug(group))
  })),
  { title: "Comparisons", icon: "eye" as const, pages: pagesIn("comparisons") }
];

const useWorkbenchCrumbs = (page: WorkbenchPage): BreadcrumbCrumb[] => {
  const navigate = useNavigate();
  const category =
    workbenchCategories.find((entry) => entry.id === page.category) ?? overviewCategory;
  const linkUnlessCurrent = (target: WorkbenchPage) =>
    target.id === page.id ? {} : { link: target.link };
  const groupPages = page.group ? pagesIn("components", groupSlug(page.group)) : [];
  return [
    {
      label: category.title,
      media: <Icon name={category.icon} />,
      ...linkUnlessCurrent(pagesIn(category.id)[0]),
      switcher: {
        label: "Switch category",
        options: workbenchCategories.map((entry) => ({
          value: entry.id,
          label: entry.title,
          media: <Icon name={entry.icon} />
        })),
        value: category.id,
        onChange: (value) =>
          navigate(
            pagesIn(value as WorkbenchPage["category"])[0].link as Parameters<typeof navigate>[0]
          )
      }
    },
    ...(page.group
      ? [
          {
            label: page.group,
            ...linkUnlessCurrent(groupPages[0]),
            switcher: {
              label: "Switch page",
              placeholder: `Search ${page.group.toLowerCase()}`,
              options: groupPages.map((entry) => ({ value: entry.id, label: entry.title })),
              value: page.id,
              onChange: (value: string) =>
                navigate(workbenchPage(value).link as Parameters<typeof navigate>[0])
            }
          }
        ]
      : []),
    ...(page.category === "overview" ? [] : [{ label: page.title }])
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
  const navigate = useNavigate();
  const { resolvedTheme: hostTheme } = useTheme();
  const [themeChoice, setThemeChoice] = useState<string>(defaultV4Theme[hostTheme]);
  const [preferred, setPreferred] = useState<Record<V4Scheme, string>>(defaultV4Theme);
  const [systemTheme, setSystemTheme] = useState<V4Scheme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const setTheme = (next: string) => {
    setThemeChoice(next);
    const named = toV4Theme(next);
    if (named) setPreferred((value) => ({ ...value, [v4ThemeScheme(named)]: named }));
  };
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const theme = themeChoice === "system" ? preferred[systemTheme] : themeChoice;
  const leaf = useMatches({
    select: (matches) => {
      const match = matches[matches.length - 1];
      return { routeId: match.routeId, params: match.params };
    }
  });
  const currentPage = routePage(leaf.routeId, leaf.params) ?? workbenchPage("overview");
  const hash = useRouterState({ select: (state) => state.location.hash });
  const legacyTarget =
    leaf.routeId === "/design-system/" && hash ? legacyHashLink(hash) : undefined;
  const insetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!hash) {
      insetRef.current?.scrollTo({ top: 0 });
      return undefined;
    }
    if (!componentCatalog.some((entry) => entry.id === currentPage.id)) return undefined;
    const started = performance.now();
    let frame = 0;
    const seek = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-component="${currentPage.id}"][data-example="${hash}"]`
      );
      if (target) scrollInsetTo(target);
      else if (performance.now() - started < 3000) frame = requestAnimationFrame(seek);
    };
    frame = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(frame);
  }, [currentPage.id, hash]);
  const nextTheme = preferred[v4ThemeScheme(theme) === "dark" ? "light" : "dark"];
  const crumbs = useWorkbenchCrumbs(currentPage);
  const go = (id: string) => navigate(workbenchPage(id).link as Parameters<typeof navigate>[0]);
  if (legacyTarget)
    return <Navigate {...(legacyTarget as Parameters<typeof Navigate>[0])} replace />;
  return (
    <V4Scope className="flex h-dvh flex-col overflow-clip" theme={theme}>
      <V4RouterProvider>
        <AccentPanelProvider>
          <a href="#workbench-content" className="sr-only focus:not-sr-only focus:p-3">
            Skip to content
          </a>
          <AppShell>
            <WorkbenchBar
              breadcrumb={crumbs}
              search={{ onClick: () => setPaletteOpen(true), label: "Search the design system" }}
              account={{
                label: "Workbench",
                name: "v4 workbench",
                email: `Design system v${tokens.version}`,
                items: [
                  { label: "Overview", icon: "home", onSelect: () => go("overview") },
                  { label: "Rules", icon: "file", onSelect: () => go("rules") },
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
            <Sidebar label="Design system" levels={sidebarLevels} />
            <AppInset ref={insetRef}>
              <div
                key={currentPage.id}
                id="workbench-content"
                data-document-view="human"
                tabIndex={-1}
                className="min-w-0 flex-1 outline-none"
              >
                <PageGutter>
                  <article>
                    <Outlet />
                  </article>
                </PageGutter>
              </div>
            </AppInset>
            <WorkbenchPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              groups={paletteGroups}
              toggleTheme={() => setTheme(nextTheme)}
            />
          </AppShell>
        </AccentPanelProvider>
      </V4RouterProvider>
    </V4Scope>
  );
};
