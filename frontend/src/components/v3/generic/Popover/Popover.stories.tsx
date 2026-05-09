import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckIcon, InfoIcon, PencilIcon } from "lucide-react";

import { Button } from "../Button";
import { Field, FieldDescription, FieldLabel } from "../Field";
import { IconButton } from "../IconButton";
import { Input } from "../Input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./Popover";

/**
 * Reach for `Popover` when the content is contextual but interactive (forms,
 * pickers, action menus). Use `Tooltip` for read-only label-style hints, `Dialog`
 * when the user must complete a task before continuing, and `DropdownMenu` for
 * pure action lists with menu semantics.
 *
 * Compose four parts:
 * - `Popover` — the root that owns open state.
 * - `PopoverTrigger` — the element that toggles the panel. Pair with `asChild` to
 *   render an existing `Button` / `IconButton` as the trigger.
 * - `PopoverContent` — the floating panel. Accepts `align` (`start` / `center` / `end`),
 *   `side` (`top` / `right` / `bottom` / `left`), `sideOffset` (gap in px), and
 *   `container` (custom portal target).
 * - `PopoverAnchor` — optional. Detaches positioning from the trigger so the panel
 *   can open relative to a different element.
 *
 */
const meta = {
  title: "Generic/Popover",
  component: Popover,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    children: { table: { disable: true } },
    open: { table: { disable: true } },
    defaultOpen: { table: { disable: true } },
    onOpenChange: { table: { disable: true } },
    modal: { table: { disable: true } }
  }
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline pairing — a `Button` trigger with `asChild` plus a `PopoverContent` panel. Click the trigger or press Enter / Space to open; Esc or an outside click dismisses. Default placement is centered below the trigger with a `sideOffset` of 4."
      }
    }
  },
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Quick info</p>
          <p className="text-muted-foreground text-sm">
            Popover content can hold any markup — text, form controls, pickers, or small action
            menus.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
};

export const WithIconButtonTrigger: Story = {
  name: "Example: With Icon Button Trigger",
  parameters: {
    docs: {
      description: {
        story:
          "Use `IconButton` + `asChild` to trigger from a single-glyph control — the canonical pattern for inline detail bubbles (e.g. resolved-secret previews, audit-log row context). Always set `aria-label` on the icon button so the trigger has an accessible name."
      }
    }
  },
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton variant="ghost-muted" size="sm" aria-label="More information">
          <InfoIcon />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">About this field</p>
          <p className="text-muted-foreground text-sm">
            The slug is auto-generated from the name and used in URLs. It can be edited later from
            project settings.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
};

export const Alignment: Story = {
  name: "Example: Alignment",
  parameters: {
    docs: {
      description: {
        story:
          "`align` controls horizontal placement relative to the trigger edge. `start` aligns the panel to the trigger's leading edge, `center` (default) centers it, `end` aligns to the trailing edge. Choose based on where the panel is most likely to fit without clipping the viewport — `end` is common for triggers that sit near the right edge of a layout."
      }
    }
  },
  render: () => (
    <div className="flex items-center gap-3">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">align=&quot;start&quot;</Button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <p className="text-sm">Panel aligned to the trigger&apos;s leading edge.</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">align=&quot;center&quot;</Button>
        </PopoverTrigger>
        <PopoverContent align="center">
          <p className="text-sm">Panel centered on the trigger.</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">align=&quot;end&quot;</Button>
        </PopoverTrigger>
        <PopoverContent align="end">
          <p className="text-sm">Panel aligned to the trigger&apos;s trailing edge.</p>
        </PopoverContent>
      </Popover>
    </div>
  )
};

export const Sides: Story = {
  name: "Example: Sides",
  parameters: {
    docs: {
      description: {
        story:
          "`side` controls which edge of the trigger the panel opens from — `top`, `right`, `bottom` (default), or `left`. Increase `sideOffset` (default `4`) to add breathing room. Radix automatically flips to the opposite side if there isn't enough viewport space."
      }
    }
  },
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">side=&quot;top&quot;</Button>
        </PopoverTrigger>
        <PopoverContent side="top">
          <p className="text-sm">Opens above the trigger.</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">side=&quot;right&quot;</Button>
        </PopoverTrigger>
        <PopoverContent side="right" sideOffset={8}>
          <p className="text-sm">Opens to the right with `sideOffset={8}`.</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">side=&quot;bottom&quot;</Button>
        </PopoverTrigger>
        <PopoverContent side="bottom">
          <p className="text-sm">Opens below the trigger (default).</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">side=&quot;left&quot;</Button>
        </PopoverTrigger>
        <PopoverContent side="left" sideOffset={8}>
          <p className="text-sm">Opens to the left with `sideOffset={8}`.</p>
        </PopoverContent>
      </Popover>
    </div>
  )
};

export const WithForm: Story = {
  name: "Example: With Form",
  parameters: {
    docs: {
      description: {
        story:
          "Drop `Field` + `Input` + an action button into `PopoverContent` for the *edit one thing inline* pattern — renaming a workspace, updating a tag, tweaking a single config value. Prefer this over a full `Dialog` when the change is small and reversible. Override the default `w-72` via `className` when the form needs more room."
      }
    }
  },
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <PencilIcon />
          Rename workspace
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Rename workspace</p>
            <p className="text-muted-foreground text-xs">
              The new name is visible to everyone with workspace access.
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="popover-workspace-name">Name</FieldLabel>
            <Input id="popover-workspace-name" defaultValue="Acme Corporation" />
            <FieldDescription>Letters, numbers, spaces, and hyphens.</FieldDescription>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
            <Button size="sm">Save</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
};

export const WithAnchor: Story = {
  name: "Example: With Custom Anchor",
  parameters: {
    docs: {
      description: {
        story:
          "Use `PopoverAnchor` to detach positioning from the trigger — the panel opens relative to the anchor instead of the button that toggles it. Useful when the visual landmark (a row, a status badge) isn't the same element as the affordance that opens the popover."
      }
    }
  },
  render: () => (
    <Popover>
      <PopoverAnchor asChild>
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
          <CheckIcon className="size-4 text-success" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Production deploy</span>
            <span className="text-xs text-muted">Anchor — panel opens here</span>
          </div>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs">
              Details
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={8}>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Deploy succeeded</p>
          <p className="text-muted-foreground text-sm">
            Triggered by Scott Wilson · 12 services updated · 38s
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
};
