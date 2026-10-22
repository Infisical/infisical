import { useEffect, useMemo, useState } from "react";
import { Palette, SquareRoundCorner } from "lucide-react";

import { componentCatalog } from "@app/components/v4/catalog";
import required from "@app/components/v4/required-capabilities.json";
import {
  CommandMenu,
  type CommandMenuGroup,
  type CommandMenuItem,
  type CommandMenuItemKind
} from "@app/components/v4/ui/command-menu";
import { type IconName } from "@app/components/v4/ui/icon";

import { useAccentPanel } from "./accent-panel";

export type PaletteControls = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleTheme: () => void;
  toggleCorners: () => void;
  groups: readonly {
    title: string;
    icon: IconName;
    pages: readonly { id: string; title: string }[];
  }[];
};

const RECENT_KEY = "v4-palette-recent";

const kindOf = (group: string): CommandMenuItemKind => {
  if (group === "Foundations") return "foundation";
  if (group === "Comparisons") return "comparison";
  if (group === "Contributing") return "page";
  if (group === "Patterns" || group === "Composites") return "pattern";
  return "component";
};

const goTo = (page: string, example?: string) => {
  window.location.hash = example ? `#${page}/${example}` : `#${page}`;
};

export const WorkbenchPalette = ({
  open,
  onOpenChange,
  toggleTheme,
  toggleCorners,
  groups
}: PaletteControls) => {
  const accent = useAccentPanel();
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
      page: { id: string; title: string },
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
          goTo(page.id);
        }
      };
    };
    const pageGroups: CommandMenuGroup[] = groups.map((group) => ({
      label: group.title,
      items: group.pages.map((page) => pageItem(page, group))
    }));
    const examples: CommandMenuItem[] = componentCatalog.flatMap((entry) =>
      entry.examples.map((example) => ({
        id: `example:${entry.id}:${example.id}`,
        label: example.title,
        description: entry.title,
        kind: "example" as const,
        keywords: [entry.title, entry.id, example.id],
        onSelect: () => {
          remember(`example:${entry.id}:${example.id}`);
          goTo(entry.id, example.id);
        }
      }))
    );
    return { pageGroups, examples };
  }, [groups]);
  const actions: CommandMenuItem[] = [
    {
      id: "action:theme",
      label: "Toggle theme",
      icon: "moon",
      kind: "action",
      onSelect: toggleTheme
    },
    {
      id: "action:corners",
      label: "Toggle corners (square or soft)",
      icon: SquareRoundCorner,
      kind: "action",
      onSelect: toggleCorners
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
      footer="Infisical 2.0 design system"
      recent={recent}
      groups={[
        ...index.pageGroups,
        { label: "Examples", items: index.examples, searchOnly: true, limit: 12 },
        { label: "Commands", items: actions }
      ]}
    />
  );
};
