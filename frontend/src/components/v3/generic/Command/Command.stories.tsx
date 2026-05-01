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

/**
 * Command renders a fuzzy-searchable command palette — an input paired with a scrollable
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
          "The baseline command palette — input + list + grouped items. Typing filters the list via the default fuzzy matcher (matches on value and any `keywords` passed to each item)."
      }
    }
  },
  render: () => (
    <Command className="w-80 border border-border">
      <CommandInput placeholder="Type a command or search..." />
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
      <CommandInput placeholder="Type a command or search..." />
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
      <CommandInput placeholder="Type a command or search..." />
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
        <CommandInput placeholder="Type a command or search..." />
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
      <PopoverContent align="start" sideOffset={4} className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search organizations..." />
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
