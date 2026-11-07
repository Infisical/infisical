import { useEffect, useMemo, useState } from "react";
import { type LinkOptions, useNavigate } from "@tanstack/react-router";
import { Palette } from "lucide-react";

import { componentCatalog } from "@app/components/v4/catalog";
import required from "@app/components/v4/required-capabilities.json";
import {
  CommandMenu,
  type CommandMenuGroup,
  type CommandMenuItem,
  type CommandMenuItemKind
} from "@app/components/v4/ui/command-menu";
import { type IconName } from "@app/components/v4/ui/icon";
import { useAppShell } from "@app/components/v4/ui/top-bar";

import { useAccentPanel } from "./accent-panel";

export type PaletteControls = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleTheme: () => void;
  groups: readonly {
    title: string;
    icon: IconName;
    pages: readonly { id: string; title: string; link: LinkOptions }[];
  }[];
};

const RECENT_KEY = "v4-palette-recent";

const kindOf = (group: string): CommandMenuItemKind => {
  if (group === "Foundations") return "foundation";
  if (group === "Comparisons") return "comparison";
  if (group === "Patterns" || group === "Composites") return "pattern";
  return "component";
};

export const WorkbenchPalette = ({ open, onOpenChange, toggleTheme, groups }: PaletteControls) => {
  const accent = useAccentPanel();
  const shell = useAppShell();
  const navigate = useNavigate();
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const remember = (id: string) =>
    setRecentIds((previous) => [id, ...previous.filter((entry) => entry !== id)].slice(0, 5));
  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
    } catch {
      // Storage is unavailable; recents last for this session only.
    }
  }, [recentIds]);
  const index = useMemo(() => {
    const aliases = Object.entries(required.aliases as Record<string, string>);
    const pageItem = (
      page: { id: string; title: string; link: LinkOptions },
      group: { title: string; icon: IconName }
    ): CommandMenuItem => {
      const entry = componentCatalog.find((item) => item.id === page.id);
      return {
        id: `page:${page.id}`,
        label: page.title,
        icon: group.icon,
        kind: kindOf(group.title),
        keywords: [
          page.id,
          ...(entry?.referenceNames ?? []),
          ...aliases.filter(([, target]) => target === page.id).map(([name]) => name)
        ],
        onSelect: () => {
          remember(`page:${page.id}`);
          navigate(page.link as Parameters<typeof navigate>[0]);
        }
      };
    };
    const pageGroups: CommandMenuGroup[] = groups.map((group) => ({
      label: group.title,
      items: group.pages.map((page) => pageItem(page, group))
    }));
    const pageLinks = new Map(
      groups.flatMap((group) => group.pages.map((page) => [page.id, page.link]))
    );
    const examples: CommandMenuItem[] = componentCatalog.flatMap((entry) =>
      entry.examples.map((example) => ({
        id: `example:${entry.id}:${example.id}`,
        label: example.title,
        description: entry.title,
        kind: "example" as const,
        keywords: [entry.title, entry.id, example.id],
        onSelect: () => {
          remember(`example:${entry.id}:${example.id}`);
          navigate({ ...pageLinks.get(entry.id), hash: example.id } as Parameters<
            typeof navigate
          >[0]);
        }
      }))
    );
    return { pageGroups, examples };
  }, [groups, navigate]);
  const actions: CommandMenuItem[] = [
    {
      id: "action:theme",
      label: "Toggle theme",
      icon: "moon",
      kind: "action",
      onSelect: toggleTheme
    },
    {
      id: "action:sidebar",
      label: "Toggle sidebar",
      icon: "sidebar",
      kind: "action",
      shortcut: "mod+B",
      onSelect: () => shell?.toggleNavigation()
    },
    {
      id: "action:accent",
      label: "Open the accent picker",
      icon: Palette,
      kind: "action",
      onSelect: () => accent?.open()
    }
  ];
  const everything = [...index.pageGroups.flatMap((group) => group.items), ...index.examples];
  const recent = recentIds
    .map((id) => everything.find((item) => item.id === id))
    .filter((item): item is CommandMenuItem => Boolean(item));
  return (
    <CommandMenu
      open={open}
      onOpenChange={onOpenChange}
      label="Search the design system"
      footer="Infisical v4 design system"
      recent={recent}
      groups={[
        ...index.pageGroups,
        { label: "Examples", items: index.examples, searchOnly: true, limit: 12 },
        { label: "Commands", items: actions }
      ]}
    />
  );
};
