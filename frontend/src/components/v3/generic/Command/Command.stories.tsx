import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  FileIcon,
  FolderIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon
} from "lucide-react";

import { Button } from "../Button";
import { Input } from "../Input";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from "./Command";
import { GlobalCommandMenu, type GlobalCommandMenuGroup } from "./GlobalCommandMenu";

/**
 * Command renders a searchable command palette — an input paired with a scrollable
 * list of items the user can navigate with keyboard or pointer. Built on `cmdk`.
 * Compose items into `CommandGroup`s (with optional headings) and separate groups with
 * `CommandSeparator`. Wrap in `CommandDialog` for a global `⌘K`-style overlay, or inline
 * in a `Popover` for contextual pickers like organization switchers.
 */
const meta = {
  title: "Generic/Command",
  component: Command,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    filter: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline command palette — input + list + grouped items. Typing filters the list via the default case-insensitive substring matcher (matching the value and any `keywords` passed to each item)."
      }
    }
  },
  render: () => (
    <Command className="w-80 border border-border">
      <CommandInput aria-label="Search commands" placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <CalendarIcon />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <FileIcon />
            <span>New File</span>
          </CommandItem>
          <CommandItem>
            <FolderIcon />
            <span>New Folder</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
};

export const WithGroups: Story = {
  name: "Example: With Groups",
  parameters: {
    docs: {
      description: {
        story:
          "Use multiple `CommandGroup`s separated by `CommandSeparator` to organize items by category. Group headings render as small muted labels above each section."
      }
    }
  },
  render: () => (
    <Command className="w-80 border border-border">
      <CommandInput aria-label="Search commands" placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <CalendarIcon />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <FileIcon />
            <span>New File</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <UserIcon />
            <span>Profile</span>
          </CommandItem>
          <CommandItem>
            <SettingsIcon />
            <span>Preferences</span>
          </CommandItem>
          <CommandItem>
            <LogOutIcon />
            <span>Log out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
};

export const WithShortcuts: Story = {
  name: "Example: With Shortcuts",
  parameters: {
    docs: {
      description: {
        story:
          "Append `CommandShortcut` inside a `CommandItem` to surface the keyboard shortcut for the action. The shortcut aligns to the right via `ml-auto`."
      }
    }
  },
  render: () => (
    <Command className="w-80 border border-border">
      <CommandInput aria-label="Search commands" placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem>
            <FileIcon />
            <span>New File</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <FolderIcon />
            <span>New Folder</span>
            <CommandShortcut>⌘⇧N</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <SettingsIcon />
            <span>Preferences</span>
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
};

const AsDialogStory = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open command palette
        <CommandShortcut>⌘K</CommandShortcut>
      </Button>
      <CommandDialog className="max-w-lg" open={open} onOpenChange={setOpen}>
        <CommandInput aria-label="Search commands" placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem onSelect={() => setOpen(false)}>
              <CalendarIcon />
              <span>Calendar</span>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <FileIcon />
              <span>New File</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem onSelect={() => setOpen(false)}>
              <UserIcon />
              <span>Profile</span>
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <LogOutIcon />
              <span>Log out</span>
              <CommandShortcut>⌘⇧Q</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};

export const AsDialog: Story = {
  name: "Example: As Dialog",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap the command palette in `CommandDialog` for a global `⌘K`-style overlay. Pass `open` / `onOpenChange` to control visibility. The dialog applies its own spacing tweaks to make the input and items feel more substantial than inline usage."
      }
    }
  },
  render: () => <AsDialogStory />
};

const GlobalNavigationStory = () => {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("No destination selected");
  const groups: GlobalCommandMenuGroup[] = [
    {
      heading: "Navigation",
      items: [
        {
          id: "navigation-calendar",
          label: "Calendar",
          breadcrumb: "Acme / Operations",
          icon: CalendarIcon,
          keywords: ["schedule", "events"],
          onSelect: () => setDestination("Calendar selected")
        },
        {
          id: "navigation-files",
          label: "Files",
          breadcrumb: "Acme / Documents",
          icon: FileIcon,
          keywords: ["documents"],
          onSelect: () => setDestination("Files selected")
        }
      ]
    },
    {
      heading: "Account",
      items: [
        {
          id: "account-settings",
          label: "Personal Settings",
          breadcrumb: "Account / General",
          icon: SettingsIcon,
          keywords: ["profile", "preferences"],
          onSelect: () => setDestination("Personal Settings selected")
        }
      ]
    }
  ];

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-sm">
        <span>Example field</span>
        <Input
          id="global-command-example-field"
          aria-label="Example field"
          placeholder="The shortcut works while typing here"
        />
      </div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Search Navigation
        <CommandShortcut>⌘/Ctrl K</CommandShortcut>
      </Button>
      <p role="status" className="text-sm text-accent">
        {destination}
      </p>
      <GlobalCommandMenu
        groups={[
          ...groups,
          {
            heading: "Explore",
            items: [
              {
                id: "search-files",
                label: "Search Files…",
                breadcrumb: "Global / Files",
                icon: FolderIcon,
                children: [{ heading: "Files", items: groups[0].items.slice(1) }],
                drilldownPlaceholder: "Search files..."
              }
            ]
          }
        ]}
        searchGroups={groups}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
};

export const GlobalNavigation: Story = {
  name: "Example: Global Navigation",
  parameters: {
    docs: {
      description: {
        story:
          'Use `GlobalCommandMenu` for a root-mounted, context-aware navigation palette. Every result has a primary label and contextual breadcrumb. Empty input shows small browse groups, typing searches `searchGroups`, and items with `children` open a drill-down view. It opens with Command+K on Apple devices and Control+K elsewhere, including from ordinary inputs. Rich editors can retain the shortcut with `data-command-menu-shortcut="ignore"`.'
      }
    }
  },
  render: () => <GlobalNavigationStory />
};

const ORGANIZATIONS = [
  { id: "1", name: "Infisical Infrastructure" },
  { id: "2", name: "Acme Corp" },
  { id: "3", name: "Globex" }
];

const InPopoverStory = () => {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("1");
  const selected = ORGANIZATIONS.find((o) => o.id === selectedId);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <BuildingIcon />
          {selected?.name ?? "Select organization"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput aria-label="Search organizations" placeholder="Search organizations..." />
          <CommandList>
            <CommandEmpty>No organizations found.</CommandEmpty>
            <CommandGroup heading="Organizations">
              {ORGANIZATIONS.map((org) => (
                <CommandItem
                  key={org.id}
                  value={org.name}
                  onSelect={() => {
                    setSelectedId(org.id);
                    setOpen(false);
                  }}
                >
                  <CheckIcon className={org.id === selectedId ? "opacity-100" : "opacity-0"} />
                  <span className="truncate">{org.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const InPopover: Story = {
  name: "Example: In Popover",
  parameters: {
    docs: {
      description: {
        story:
          "Place an inline `Command` inside a `Popover` to build a contextual picker — the pattern used by the organization switcher in the main navbar. The check mark on the currently-selected item uses an opacity toggle so every row keeps the same horizontal rhythm."
      }
    }
  },
  render: () => <InPopoverStory />
};
