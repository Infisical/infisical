import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ArrowDownAZIcon,
  ArrowUpDownIcon,
  CopyIcon,
  EditIcon,
  GridIcon,
  ListIcon,
  MailIcon,
  MoreHorizontalIcon,
  RowsIcon,
  ShareIcon,
  TrashIcon,
  UserPlusIcon
} from "lucide-react";

import { Button } from "../Button";
import { IconButton } from "../IconButton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./Dropdown";

/**
 * DropdownMenu renders a contextual menu that opens from a trigger — use it for
 * row / card actions, segmented triggers, and any grouped list of actions that
 * don't warrant a dedicated panel. Composable subcomponents cover labels,
 * separators, shortcuts, checkbox / radio items, and nested submenus.
 */
const meta = {
  title: "Generic/Dropdown",
  component: DropdownMenu,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"]
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          'The baseline menu — a labelled group of actions with leading icons and keyboard shortcuts, a `DropdownMenuSeparator`, and a trailing `variant="danger"` item for destructive actions.'
      }
    }
  },
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="outline" aria-label="Open menu">
          <MoreHorizontalIcon />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem>
          <EditIcon />
          Edit
          <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CopyIcon />
          Duplicate
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ShareIcon />
          Share
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger">
          <TrashIcon />
          Delete
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
};

const CheckboxItemsStory = () => {
  const [showGrid, setShowGrid] = useState(true);
  const [showList, setShowList] = useState(false);
  const [showRows, setShowRows] = useState(true);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">View options</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Toggle panels</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={showGrid} onCheckedChange={setShowGrid}>
          <GridIcon />
          Grid
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showList} onCheckedChange={setShowList}>
          <ListIcon />
          List
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showRows} onCheckedChange={setShowRows}>
          <RowsIcon />
          Rows
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const CheckboxItems: Story = {
  name: "Example: Checkbox Items",
  parameters: {
    docs: {
      description: {
        story:
          "Use `DropdownMenuCheckboxItem` for toggleable options — each item independently controls its own `checked` state. A check mark appears on the right when the item is active."
      }
    }
  },
  render: () => <CheckboxItemsStory />
};

const RadioItemsStory = () => {
  const [sort, setSort] = useState("recent");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <ArrowUpDownIcon />
          Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          <DropdownMenuRadioItem value="recent">Most recent</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="oldest">Oldest</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="alphabetical">
            <ArrowDownAZIcon />
            Alphabetical
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const RadioItems: Story = {
  name: "Example: Radio Items",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap `DropdownMenuRadioItem`s in a `DropdownMenuRadioGroup` with `value` + `onValueChange` for mutually exclusive selection — ideal for sort orders, view modes, or filter presets."
      }
    }
  },
  render: () => <RadioItemsStory />
};

export const WithSubmenu: Story = {
  name: "Example: With Submenu",
  parameters: {
    docs: {
      description: {
        story:
          "Nest a `DropdownMenuSub` (with `SubTrigger` + `SubContent`) inside the main menu to expose a secondary group without cluttering the top-level list. A trailing chevron indicates the expandable item."
      }
    }
  },
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Invite</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Invite member</DropdownMenuLabel>
        <DropdownMenuItem>
          <UserPlusIcon />
          Add existing user
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MailIcon />
            Send invite
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem>By email</DropdownMenuItem>
            <DropdownMenuItem>By invite link</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>SCIM provisioning</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger">
          <TrashIcon />
          Revoke pending invites
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
};
