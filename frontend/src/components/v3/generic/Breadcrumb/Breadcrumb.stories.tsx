import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from "@tanstack/react-router";
import { FolderIcon, HomeIcon, MoreHorizontalIcon, SlashIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../Dropdown";
import { IconButton } from "../IconButton";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "./Breadcrumb";

/**
 * `Breadcrumb` is the navigation primitive for showing a user's location inside a
 * nested hierarchy — projects, folders, settings categories, anything tree-shaped.
 * Compose it from `Breadcrumb` (the `<nav>` wrapper), `BreadcrumbList`,
 * `BreadcrumbItem`, `BreadcrumbLink` (clickable parents), `BreadcrumbPage` (the
 * current location, non-clickable), `BreadcrumbSeparator`, and `BreadcrumbEllipsis`.
 *
 * **Anatomy rules**: every trail starts with a list of `BreadcrumbItem`s separated
 * by `BreadcrumbSeparator`s, and ends in a single `BreadcrumbPage` for the active
 * location. Use `BreadcrumbLink asChild` to slot in a router `Link` so the row
 * stays an SPA-style navigation. The default separator is a chevron — pass any
 * children to `BreadcrumbSeparator` to swap it (slashes, dots, custom icons).
 *
 * **When to reach for it**: any deep page that has a meaningful parent chain.
 * Skip it on top-level pages where there is nothing to navigate up to.
 */
const meta = {
  title: "Generic/Breadcrumb",
  component: Breadcrumb,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"]
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Anatomy: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline — a list of `BreadcrumbLink`s separated by the default chevron, terminating in a `BreadcrumbPage` for the current location. This is the structure to start from for every trail."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Projects</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Acme</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Secrets</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const CurrentPageOnly: Story = {
  name: "Anatomy: Current Page Only",
  parameters: {
    docs: {
      description: {
        story:
          'When there is no parent worth surfacing, render a single `BreadcrumbPage`. It still emits the right ARIA — `aria-current="page"` — so screen readers announce the location, even without a trail.'
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>Settings</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const CustomSeparatorSlash: Story = {
  name: "Variant: Slash Separator",
  parameters: {
    docs: {
      description: {
        story:
          "Pass any children to `BreadcrumbSeparator` to override the default chevron. A rotated `SlashIcon` reads as a path delimiter — handy for file-system-flavoured trails (folder paths, secret paths, repo URLs)."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">infra</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <SlashIcon className="-rotate-12" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">prod</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <SlashIcon className="-rotate-12" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage>postgres</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const CustomSeparatorDot: Story = {
  name: "Variant: Dot Separator",
  parameters: {
    docs: {
      description: {
        story:
          "A middle dot reads as a quieter, more typographic delimiter — good for breadcrumbs that sit alongside body copy or status text where chevrons would feel too directional."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Audit logs</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>·</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">2026-04</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>·</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage>Event 18a3-9c</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const WithLeadingIcon: Story = {
  name: "Example: With Leading Icon",
  parameters: {
    docs: {
      description: {
        story:
          "Drop an icon inside a `BreadcrumbLink` to anchor the trail visually — a home icon for the org root, a folder icon for a tree's root, or a product mark for a multi-product workspace. Pair with a sibling label or use the icon alone (with `aria-label`) to save horizontal space."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#" aria-label="Home">
            <HomeIcon />
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Acme</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Members</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const WithEllipsis: Story = {
  name: "Example: Static Ellipsis",
  parameters: {
    docs: {
      description: {
        story:
          "Use `BreadcrumbEllipsis` between segments to indicate that the middle of the trail has been collapsed for space. This is the static, non-interactive variant — pair it with the *Collapsed With Dropdown* pattern below when the hidden segments need to remain reachable."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Projects</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">infra</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>vars</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const AsRouterLink: Story = {
  name: "Example: As Router Link (asChild)",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `asChild` to `BreadcrumbLink` and slot in a TanStack `<Link>` so each parent crumb stays an SPA navigation rather than a full-page reload. This is the default pattern for in-app trails."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to=".">Organization</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to=".">Projects</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Acme</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const CollapsedWithDropdown: Story = {
  name: "Example: Collapsed With Dropdown",
  parameters: {
    docs: {
      description: {
        story:
          "When a path is too long to fit, swap the middle segments for a `DropdownMenu` triggered by a `BreadcrumbEllipsis` (or kebab `IconButton`). This keeps every parent reachable in one click while the trail collapses to first → ellipsis → last. This is the canonical pattern for deep folder paths."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#" aria-label="Root">
            <FolderIcon />
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <SlashIcon className="-rotate-12" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">api</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <SlashIcon className="-rotate-12" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="xs" variant="ghost" aria-label="Show hidden folders">
                <MoreHorizontalIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>
                <FolderIcon /> services
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FolderIcon /> auth
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FolderIcon /> integrations
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <SlashIcon className="-rotate-12" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">config</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <SlashIcon className="-rotate-12" />
        </BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage>vars</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};

export const LongPath: Story = {
  name: "Example: Long Path",
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          "`BreadcrumbList` is a wrapping flex row, so a path that doesn't fit will flow onto a second line rather than overflow. Constrain the parent's width when previewing wrap behavior — the page chrome will impose its own bound in production."
      }
    }
  },
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Organization</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Acme Corporation</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Projects</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Production Secrets</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Database</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Connection strings</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
};
