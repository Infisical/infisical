import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FingerprintIcon,
  FolderIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  TrashIcon,
  UserIcon
} from "lucide-react";

import { ScrollArea } from "@app/components/v3/generic";

import { Button } from "../Button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuChecked,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./DropdownMenu";

const KitchenSinkItems = (
  <>
    <DropdownMenuLabel>Menu Label</DropdownMenuLabel>
    <DropdownMenuGroup>
      <DropdownMenuItem>Menu Item</DropdownMenuItem>
      <DropdownMenuItem>
        Shortcut
        <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem>
        <UserIcon />
        With Icon
      </DropdownMenuItem>
      <DropdownMenuItem variant="danger">
        <TrashIcon />
        Destructive
      </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Sub Menu</DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Email</DropdownMenuItem>
            <DropdownMenuItem>Message</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>More...</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuItem isDisabled>Disabled</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuCheckboxItem>Secrets</DropdownMenuCheckboxItem>
  </>
);

function DropdownMenuDemo(props: React.ComponentProps<typeof DropdownMenuContent>) {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent avoidCollisions={false} className="w-[200px]" {...props} />
    </DropdownMenu>
  );
}

const meta = {
  title: "Generic/DropdownMenu",
  component: DropdownMenuDemo,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    side: { control: "inline-radio", options: ["top", "bottom", "left", "right"] },
    align: { control: "inline-radio", options: ["start", "center", "end"] },
    children: {
      table: {
        disable: true
      }
    }
  },
  args: {
    align: "start",
    side: "right",
    children: KitchenSinkItems
  },
  decorators: (Story) => {
    return (
      <div className="flex h-[500px] items-center justify-center">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof DropdownMenuDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
  name: "Side: Top",
  args: {
    side: "top"
  }
};

export const Bottom: Story = {
  name: "Side: Bottom",
  args: {
    side: "bottom"
  }
};

export const Left: Story = {
  name: "Side: Left",
  args: {
    side: "left"
  }
};

export const Right: Story = {
  name: "Side: Right",
  args: {
    side: "right"
  }
};

export const Center: Story = {
  name: "Align: Center",
  args: {
    align: "center"
  }
};

export const Start: Story = {
  name: "Align: Start",
  args: {
    align: "start"
  }
};

export const End: Story = {
  name: "Align: End",
  args: {
    align: "end"
  }
};

export const Checkboxes = (props: React.ComponentProps<typeof DropdownMenuContent>) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const [showSecrets, setShowSecrets] = React.useState<DropdownMenuChecked>(true);
  const [showFolders, setShowFolders] = React.useState<DropdownMenuChecked>(false);
  const [showDynamicSecrets, setShowDynamicSecrets] = React.useState<DropdownMenuChecked>(false);
  const [showSecretRotations, setshowSecretRotations] = React.useState<DropdownMenuChecked>(false);
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent avoidCollisions={false} className="w-[200px]" {...props}>
        <DropdownMenuLabel>Filter</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          onSelect={(event) => event.preventDefault()} // TODO: make prop?
          checked={showSecrets}
          onCheckedChange={setShowSecrets}
        >
          <KeyRoundIcon />
          Secrets
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          onSelect={(event) => event.preventDefault()} // TODO: make prop?
          checked={showFolders}
          onCheckedChange={setShowFolders}
          disabled
        >
          <FolderIcon />
          Folders
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          onSelect={(event) => event.preventDefault()} // TODO: make prop?
          checked={showDynamicSecrets}
          onCheckedChange={setShowDynamicSecrets}
        >
          <FingerprintIcon />
          Dynamic Secrets
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          onSelect={(event) => event.preventDefault()} // TODO: make prop?
          checked={showSecretRotations}
          onCheckedChange={setshowSecretRotations}
        >
          <RefreshCwIcon />
          Secret Rotations
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

Checkboxes.storyName = "Example: Checkboxes";

export const RadioGroup = (props: React.ComponentProps<typeof DropdownMenuContent>) => {
  const [isOpen, setIsOpen] = React.useState(true);
  const [value, setValue] = React.useState("all");

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent avoidCollisions={false} className="w-[200px]" {...props}>
        <DropdownMenuLabel>Select an Author</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={setValue}>
          <DropdownMenuRadioItem
            onSelect={(event) => event.preventDefault()} // TODO: make prop?
            value="1"
          >
            alice@infisical.com
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            onSelect={(event) => event.preventDefault()} // TODO: make prop?
            value="2"
          >
            john@infisical.com
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            onSelect={(event) => event.preventDefault()} // TODO: make prop?
            value="3"
          >
            morgan@infisical.com
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            onSelect={(event) => event.preventDefault()} // TODO: make prop?
            value="4"
          >
            edgar@infisical.com
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

RadioGroup.storyName = "Example: Radio Group";

export const Scroll = (props: React.ComponentProps<typeof DropdownMenuContent>) => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent avoidCollisions={false} className="w-[200px]" {...props}>
        <DropdownMenuLabel>Select an Author</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <ScrollArea className="h-80 w-full">
            {Array.from(Array(20)).map((_, i) => (
              <DropdownMenuItem key={(i + 1).toString()}>Menu Item {i + 1}</DropdownMenuItem>
            ))}
          </ScrollArea>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Fixed Item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

Scroll.storyName = "Example: Scroll Area";
