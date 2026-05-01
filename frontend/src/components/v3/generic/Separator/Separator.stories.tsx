import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon, ListIcon, UnderlineIcon } from "lucide-react";

import { IconButton } from "../IconButton";
import { Separator } from "./Separator";

/**
 * `Separator` is the v3 divider primitive — a hairline that visually splits
 * related content. Built on Radix's `Separator` so it ships with the right
 * ARIA out of the box.
 *
 * Two layout modes:
 * - **`orientation="horizontal"`** (default) — a full-width line between
 *   stacked sections (settings groups, dialog chrome, scroll regions).
 * - **`orientation="vertical"`** — a full-height line between inline groups
 *   (toolbar buttons, breadcrumb segments). Place it inside a flex row whose
 *   height is defined by its content; the separator stretches to that height.
 *
 * By default `Separator` is `decorative={true}` — the line is just visual and
 * hidden from assistive tech. Pass `decorative={false}` when the divider
 * expresses semantic structure (e.g. between unrelated topic groups in a long
 * form) so screen readers announce it as a divider.
 *
 * For a labeled divider ("OR" between sign-in methods, "AND" between filter
 * groups), reach for `FieldSeparator` instead — it renders the same line with
 * inline text.
 */
const meta = {
  title: "Generic/Separator",
  component: Separator,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"]
    },
    decorative: {
      control: "boolean"
    },
    className: {
      table: { disable: true }
    }
  },
  args: {
    orientation: "horizontal",
    decorative: true
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Anatomy: Horizontal",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline horizontal separator — a full-width hairline. Use it to split stacked content sections so the eye registers where one section ends and the next begins."
      }
    }
  },
  render: (args) => <Separator {...args} />
};

export const Vertical: Story = {
  name: "Variant: Vertical",
  args: {
    orientation: "vertical"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass `orientation=\"vertical\"` to render a full-height divider between inline elements. The separator stretches to its parent's height — place it inside a flex row, and the parent's content (or explicit height) gives the line something to fill."
      }
    }
  },
  render: () => (
    <div className="flex h-6 items-center gap-3 text-sm text-foreground">
      <span>Edit</span>
      <Separator orientation="vertical" />
      <span>Duplicate</span>
      <Separator orientation="vertical" />
      <span>Delete</span>
    </div>
  )
};

export const BetweenSections: Story = {
  name: "Example: Between Sections",
  parameters: {
    docs: {
      description: {
        story:
          "Drop a `Separator` between stacked content sections so each reads as its own visual unit. Common in settings panels, profile detail panes, and anywhere a long page is broken into named topic groups."
      }
    }
  },
  render: () => (
    <div className="flex flex-col gap-4 text-sm text-foreground">
      <div>
        <div className="font-medium">Account</div>
        <div className="text-accent">john@infisical.com</div>
      </div>
      <Separator />
      <div>
        <div className="font-medium">Workspace</div>
        <div className="text-accent">acme-prod</div>
      </div>
      <Separator />
      <div>
        <div className="font-medium">Role</div>
        <div className="text-accent">Admin</div>
      </div>
    </div>
  )
};

export const InToolbar: Story = {
  name: "Example: In Toolbar",
  parameters: {
    docs: {
      description: {
        story:
          "Use a vertical `Separator` to split a horizontal control strip into logical groups — formatting toolbars, header actions, breadcrumb chrome. Place it inside a flex row alongside the controls and it stretches to the row's height automatically."
      }
    }
  },
  render: () => (
    <div className="mx-auto flex h-9 w-fit items-center gap-1 rounded-md border border-border bg-container px-1.5">
      <IconButton variant="ghost" size="xs" aria-label="Bold">
        <BoldIcon />
      </IconButton>
      <IconButton variant="ghost" size="xs" aria-label="Italic">
        <ItalicIcon />
      </IconButton>
      <IconButton variant="ghost" size="xs" aria-label="Underline">
        <UnderlineIcon />
      </IconButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <IconButton variant="ghost" size="xs" aria-label="Link">
        <LinkIcon />
      </IconButton>
      <IconButton variant="ghost" size="xs" aria-label="Code">
        <CodeIcon />
      </IconButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <IconButton variant="ghost" size="xs" aria-label="Bulleted list">
        <ListIcon />
      </IconButton>
    </div>
  )
};
