import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BadgeCheckIcon,
  FileIcon,
  MoreVerticalIcon,
  StarIcon,
  TrashIcon,
  UserIcon
} from "lucide-react";
import { fn } from "storybook/test";

import { Badge } from "../Badge";
import { Button } from "../Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle
} from "./Item";

const meta = {
  title: "Generic/Item",
  component: Item,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "muted"]
    },
    size: {
      control: "select",
      options: ["default", "sm"]
    }
  },
  args: {
    children: (
      <>
        <ItemMedia variant="icon">
          <FileIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Item Title</ItemTitle>
          <ItemDescription>This is an item description.</ItemDescription>
        </ItemContent>
      </>
    )
  }
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Variant: Default",
  args: {
    variant: "default"
  }
};

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline"
  }
};

export const Muted: Story = {
  name: "Variant: Muted",
  args: {
    variant: "muted"
  }
};

export const SizeDefault: Story = {
  name: "Size: Default",
  args: {
    variant: "outline",
    size: "default"
  }
};

export const SizeSmall: Story = {
  name: "Size: Small",
  args: {
    variant: "outline",
    size: "sm"
  }
};

export const TitleOnly: Story = {
  name: "Example: Title Only",
  args: {
    variant: "outline",
    size: "sm",
    children: (
      <>
        <ItemMedia>
          <BadgeCheckIcon className="size-5" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Your profile has been verified.</ItemTitle>
        </ItemContent>
      </>
    )
  }
};

export const WithIcon: Story = {
  name: "Example: With Icon",
  args: {
    variant: "outline",
    children: (
      <>
        <ItemMedia variant="icon">
          <FileIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Document.pdf</ItemTitle>
          <ItemDescription>PDF file &quot; 2.4 MB &quot; Modified 2 hours ago</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">
            <MoreVerticalIcon />
          </Button>
        </ItemActions>
      </>
    )
  }
};

export const WithImage: Story = {
  name: "Example: With Image",
  args: {
    variant: "outline",
    children: (
      <>
        <ItemMedia variant="image">
          <img src="https://picsum.photos/32" alt="Profile" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>John Doe</ItemTitle>
          <ItemDescription>john.doe@example.com</ItemDescription>
        </ItemContent>
      </>
    )
  }
};

export const WithActions: Story = {
  name: "Example: With Actions",
  args: {
    variant: "outline",
    children: (
      <>
        <ItemMedia variant="icon">
          <UserIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Team Member</ItemTitle>
          <ItemDescription>Active member since Jan 2024</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm" onClick={fn()}>
            <StarIcon />
          </Button>
          <Button variant="ghost" size="sm" onClick={fn()}>
            <TrashIcon />
          </Button>
        </ItemActions>
      </>
    )
  }
};

export const WithBadge: Story = {
  name: "Example: With Badge",
  args: {
    variant: "outline",
    children: (
      <>
        <ItemMedia variant="icon">
          <FileIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            Project Repository
            <Badge variant="success">Active</Badge>
          </ItemTitle>
          <ItemDescription>Last commit 5 minutes ago</ItemDescription>
        </ItemContent>
      </>
    )
  }
};

export const WithHeaderFooter: Story = {
  name: "Example: With Header & Footer",
  args: {
    variant: "outline",
    children: (
      <>
        <ItemHeader>
          <ItemTitle>Project Name</ItemTitle>
          <Badge variant="info">New</Badge>
        </ItemHeader>
        <ItemContent>
          <ItemDescription>
            This is a complex item with header and footer sections for additional metadata.
          </ItemDescription>
        </ItemContent>
        <ItemFooter>
          <span className="text-xs text-muted-foreground">Created: Jan 1, 2024</span>
          <Button variant="outline" size="sm">
            View Details
          </Button>
        </ItemFooter>
      </>
    )
  }
};

export const ItemGroupExample: Story = {
  name: "Example: Item Group",
  render: () => (
    <ItemGroup className="w-[400px]">
      <Item>
        <ItemMedia variant="icon">
          <FileIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>First Item</ItemTitle>
          <ItemDescription>Description for first item</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item>
        <ItemMedia variant="icon">
          <UserIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Second Item</ItemTitle>
          <ItemDescription>Description for second item</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item>
        <ItemMedia variant="icon">
          <StarIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Third Item</ItemTitle>
          <ItemDescription>Description for third item</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
};

export const MultipleContent: Story = {
  name: "Example: Multiple Content Sections",
  args: {
    variant: "outline",
    children: (
      <>
        <ItemMedia variant="icon">
          <FileIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Main Content</ItemTitle>
          <ItemDescription>This is the primary content area with a description.</ItemDescription>
        </ItemContent>
        <ItemContent>
          <div className="text-right">
            <div className="text-sm font-medium">$49.99</div>
            <div className="text-xs text-muted-foreground">per month</div>
          </div>
        </ItemContent>
      </>
    )
  }
};

export const NoMedia: Story = {
  name: "Example: No Media",
  args: {
    variant: "outline",
    children: (
      <>
        <ItemContent>
          <ItemTitle>Item Without Icon</ItemTitle>
          <ItemDescription>This item doesn&apos;t have any media element.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="outline" size="sm">
            Action
          </Button>
        </ItemActions>
      </>
    )
  }
};
