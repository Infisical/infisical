import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from "@tanstack/react-router";
import {
  BellIcon,
  ChevronRightIcon,
  EllipsisIcon,
  ImageIcon,
  KeyIcon,
  LockIcon,
  PencilIcon,
  TrashIcon,
  UserIcon
} from "lucide-react";

import { Badge } from "../Badge";
import { Button } from "../Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../Dropdown";
import { IconButton } from "../IconButton";
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

/**
 * `Item` is the row primitive used for lists, settings panes, navigation entries,
 * and selection menus. Compose it from `ItemGroup`, `Item`, `ItemMedia`,
 * `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`, `ItemHeader`,
 * `ItemFooter`, and `ItemSeparator` — the layout is driven entirely by composition.
 *
 */
const meta = {
  title: "Generic/Item",
  component: Item,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    className: "w-[500px]"
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "muted"]
    },
    size: {
      control: "select",
      options: ["default", "sm", "xs"]
    },
    asChild: {
      table: {
        disable: true
      }
    },
    children: {
      table: {
        disable: true
      }
    },
    className: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Variant: Default",
  args: {
    variant: "default"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Borderless baseline — use this variant when the row is already inside a bordered surface (a `Card`, `Sheet`, or `DropdownMenuContent`) so the row blends into its container instead of stacking another frame."
      }
    }
  },
  render: (args) => (
    <Item {...args}>
      <ItemMedia variant="icon">
        <KeyIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>API Key</ItemTitle>
        <ItemDescription>Service-to-service authentication credential.</ItemDescription>
      </ItemContent>
      <ChevronRightIcon className="text-muted-foreground size-4" />
    </Item>
  )
};

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Standalone bordered row — use on the page background when the `Item` is not nested inside another bordered surface and needs its own visual frame."
      }
    }
  },
  render: (args) => (
    <Item {...args}>
      <ItemMedia variant="icon">
        <UserIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Account</ItemTitle>
        <ItemDescription>Manage your profile and personal preferences.</ItemDescription>
      </ItemContent>
      <ChevronRightIcon className="text-muted-foreground size-4" />
    </Item>
  )
};

export const SizeSm: Story = {
  name: "Size: Small",
  args: {
    variant: "outline",
    size: "sm"
  },
  parameters: {
    docs: {
      description: {
        story:
          '`size="sm"` tightens the parent `ItemGroup`\'s inter-item gap. Reach for it when stacking many rows in a single panel and the default rhythm feels too airy.'
      }
    }
  },
  render: (args) => (
    <ItemGroup>
      <Item {...args}>
        <ItemMedia variant="icon">
          <BellIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Notifications</ItemTitle>
        </ItemContent>
      </Item>
      <Item {...args}>
        <ItemMedia variant="icon">
          <UserIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Profile</ItemTitle>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
};

export const SizeXs: Story = {
  name: "Size: Extra Small",
  args: {
    variant: "outline",
    size: "xs"
  },
  parameters: {
    docs: {
      description: {
        story:
          '`size="xs"` is for dense lists — collapsed inner spacing, smaller media thumbnails, and tighter description text. It also drops its own padding when nested inside a `DropdownMenuContent`, so it slots cleanly into command menus, picker lists, and other compact stacks.'
      }
    }
  },
  render: (args) => (
    <ItemGroup>
      <Item {...args}>
        <ItemMedia variant="icon">
          <KeyIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Universal Auth</ItemTitle>
          <ItemDescription>Token-based authentication.</ItemDescription>
        </ItemContent>
      </Item>
      <Item {...args}>
        <ItemMedia variant="icon">
          <LockIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Kubernetes Auth</ItemTitle>
          <ItemDescription>Service-account JWT exchange.</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
};

export const WithIconMedia: Story = {
  name: "Example: With Icon Media",
  args: {
    variant: "outline"
  },
  parameters: {
    docs: {
      description: {
        story:
          '`ItemMedia variant="icon"` is the slot for any leading Lucide icon. When `ItemDescription` is present (and especially when it wraps to multiple lines), the media automatically aligns to the top of the row — no manual alignment needed.'
      }
    }
  },
  render: (args) => (
    <Item {...args}>
      <ItemMedia variant="icon">
        <BellIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Deployment alerts</ItemTitle>
        <ItemDescription>
          Get notified when a production deployment fails, when a release is rolled back, or when a
          health check starts reporting degraded status.
        </ItemDescription>
      </ItemContent>
    </Item>
  )
};

export const WithImageMedia: Story = {
  name: "Example: With Image Media",
  args: {
    variant: "outline"
  },
  parameters: {
    docs: {
      description: {
        story:
          '`ItemMedia variant="image"` renders a rounded thumbnail that scales down with the row size. Drop an `<img>` (or any element) inside — the wrapper handles cropping so avatars and integration logos stay square.'
      }
    }
  },
  render: (args) => (
    <Item {...args}>
      <ItemMedia variant="image">
        <ImageIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Ada Carter</ItemTitle>
        <ItemDescription>ada@infisical.com · Owner</ItemDescription>
      </ItemContent>
      <Badge variant="success">Active</Badge>
    </Item>
  )
};

export const WithActions: Story = {
  name: "Example: With Actions",
  args: {
    variant: "outline"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Trailing `ItemActions` is the canonical settings-row composition: a label + description on the left, a kebab `DropdownMenu` on the right. `ItemActions` lays out trailing controls with consistent spacing — pile in badges, status chips, buttons, or menus as needed."
      }
    }
  },
  render: (args) => (
    <Item {...args}>
      <ItemMedia variant="icon">
        <KeyIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Production API Key</ItemTitle>
        <ItemDescription>Last used 12 minutes ago.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge variant="info">prod</Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Key options">
              <EllipsisIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="danger">
              <TrashIcon />
              Revoke
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  )
};

export const WithHeaderAndFooter: Story = {
  name: "Example: With Header and Footer",
  args: {
    variant: "outline"
  },
  parameters: {
    docs: {
      description: {
        story:
          "`ItemHeader` and `ItemFooter` break the row into stacked sections — header above the body, footer below. Use this layout when a single row needs to surface metadata above the content and actions below it."
      }
    }
  },
  render: (args) => (
    <Item {...args}>
      <ItemHeader>
        <ItemTitle>Universal Auth</ItemTitle>
        <Badge variant="success">Active</Badge>
      </ItemHeader>
      <ItemContent>
        <ItemDescription>
          Token-based authentication for service-to-service calls. Tokens expire after the
          configured TTL and may be rotated at any time.
        </ItemDescription>
      </ItemContent>
      <ItemFooter>
        <span className="text-muted-foreground text-xs">Created 04/10/2026 · 3 active tokens</span>
        <Button variant="outline" size="xs">
          Manage tokens
        </Button>
      </ItemFooter>
    </Item>
  )
};

export const AsLink: Story = {
  name: "Example: As Link (asChild)",
  args: {
    variant: "outline",
    asChild: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass `asChild` and drop a TanStack `<Link>` (or a plain `<a>`) inside to turn the entire row into a single navigation target. Hover styling and transitions are wired in for free — reach for this pattern any time the whole row should be clickable."
      }
    }
  },
  render: (args) => (
    <Item {...args}>
      <Link to=".">
        <ItemMedia variant="icon">
          <UserIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Account settings</ItemTitle>
          <ItemDescription>Profile, security, and notification preferences.</ItemDescription>
        </ItemContent>
        <ChevronRightIcon className="text-muted-foreground size-4" />
      </Link>
    </Item>
  )
};

export const InGroupWithSeparator: Story = {
  name: "Example: In ItemGroup with Separator",
  args: {
    variant: "default"
  },
  parameters: {
    docs: {
      description: {
        story:
          "`ItemGroup` stacks rows with consistent vertical rhythm (auto-tightening at `sm` and `xs` sizes). Drop in `ItemSeparator` between rows when you want explicit dividers instead of relying on the row borders or background contrast."
      }
    }
  },
  render: (args) => (
    <ItemGroup>
      <Item {...args}>
        <ItemMedia variant="icon">
          <KeyIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>API Keys</ItemTitle>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item {...args}>
        <ItemMedia variant="icon">
          <UserIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Members</ItemTitle>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item {...args}>
        <ItemMedia variant="icon">
          <BellIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Notifications</ItemTitle>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
};

export const FullComposition: Story = {
  name: "Example: Full Composition",
  args: {
    variant: "outline"
  },
  parameters: {
    docs: {
      description: {
        story:
          "A realistic settings-list panel — an `ItemGroup` of three outlined rows, each with an icon, title, description, status `Badge`, and a kebab `DropdownMenu` for row-level actions. This is the canonical layout for an entity-management page (auth methods, integrations, secret approvers)."
      }
    }
  },
  render: (args) => (
    <ItemGroup className="w-[600px]">
      <Item {...args}>
        <ItemMedia variant="icon">
          <KeyIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Universal Auth</ItemTitle>
          <ItemDescription>
            Token-based authentication for service-to-service calls.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="success">Active</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Universal Auth options">
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger">
                <TrashIcon />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
      <Item {...args}>
        <ItemMedia variant="icon">
          <LockIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Kubernetes Auth</ItemTitle>
          <ItemDescription>Service-account JWT exchange via the cluster API.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="danger">Locked</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Kubernetes Auth options">
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger">
                <TrashIcon />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
      <Item {...args}>
        <ItemMedia variant="icon">
          <UserIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>OIDC Auth</ItemTitle>
          <ItemDescription>Federated login through an external identity provider.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="warning">Pending</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="OIDC Auth options">
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger">
                <TrashIcon />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
    </ItemGroup>
  )
};
