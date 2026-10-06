import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckIcon, InfoIcon, PencilIcon } from "lucide-react";

import { Button } from "../Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../Dialog";
import { Field, FieldDescription, FieldLabel } from "../Field";
import { IconButton } from "../IconButton";
import { Input } from "../Input";
import {
  InteractiveHoverPopover,
  InteractiveHoverPopoverContent,
  InteractiveHoverPopoverTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger
} from "./Popover";
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
 *   `container` (custom portal target). It preserves an 8px viewport gutter by default.
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
          "`side` controls which edge of the trigger the panel opens from — `top`, `right`, `bottom` (default), or `left`. Increase `sideOffset` (default `4`) to add breathing room. Radix automatically flips to the opposite side if there isn't enough viewport space and preserves an 8px viewport gutter by default."
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

function InteractiveHelp({
  label = "Coming Soon",
  container
}: {
  label?: string;
  container?: HTMLElement | null;
}) {
  return (
    <InteractiveHoverPopover side="bottom" align="center" sideOffset={5} delay={50} closeDelay={0}>
      <InteractiveHoverPopoverTrigger asChild>
        <Button variant="outline">{label}</Button>
      </InteractiveHoverPopoverTrigger>
      <InteractiveHoverPopoverContent container={container} aria-label="Coming Soon services">
        <p className="mb-2">Infisical is constantly adding support for more services.</p>
        <p>
          If you don&apos;t see the third-party service you&apos;re looking for,{" "}
          <a
            href="https://community.infisical.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            let us know in the community forum
          </a>{" "}
          or{" "}
          <a
            href="https://github.com/Infisical/infisical/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            make a request on GitHub
          </a>
          .
        </p>
      </InteractiveHoverPopoverContent>
    </InteractiveHoverPopover>
  );
}

export const InteractiveHoverLinks: Story = {
  name: "Example: Interactive Hover Links",
  parameters: {
    docs: {
      description: {
        story:
          "Use the three separately named InteractiveHoverPopover parts for lightweight interactive help with links. The new Root is uncontrolled only: defaultOpen sets its initial state and onOpenChange reports notifications, not acceptance or veto. Content stays inline immediately after Trigger, so a focused trigger can hover open and Tab directly to both links. Hover opening and exit retain existing focus only when content has not received focus; cold Enter opens the native dialog, then Tab reaches links. Escape from a focused link returns focus to the trigger after native exit. The shown composition requires nonclipping ancestors; it does not replace the ordinary click Popover or guarantee rapid exit-window parent dismissal. The 50ms delay is configured here, not presented as a measured timing guarantee."
      }
    }
  },
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <Button variant="ghost">Before help</Button>
      <InteractiveHelp />
      <Button variant="ghost">After help</Button>
      <p className="max-w-sm text-sm text-muted">
        Hover without moving focus, then use native Tab and Escape to inspect the links.
      </p>
    </div>
  )
};

export const InteractiveHoverParentBoundaries: Story = {
  name: "Boundary: Default Dialog Clipping",
  parameters: {
    docs: {
      description: {
        story:
          "Default Dialog Content is transformed and scroll-clipping: the inline hover panel below its trigger is visibly clipped in the first example. The second example explicitly owns a nonclipping Dialog composition using the public className API; no Dialog defaults, tokens or lifecycle are changed. These are distinct contracts, not universal parent parity. Short picker-parent containment, Loader rendering, actual picker scrolling and rapid second Escape need separately attributed acceptance; a fitting popup does not make an off-screen trigger usable."
      }
    }
  },
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <p className="max-w-sm text-sm text-muted">
        Unsupported default clipping and an explicitly owned nonclipping composition.
      </p>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Default Dialog: clipped hover panel</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Unsupported default clipping</DialogTitle>
          <DialogDescription>
            This parent keeps its defaults. The inline help below is clipped by its boundary.
          </DialogDescription>
          <InteractiveHelp label="Hover to see the clipping" />
          <p className="text-sm text-muted">
            Popup visibility is not guaranteed in this composition.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Owned nonclipping Dialog</Button>
        </DialogTrigger>
        <DialogContent className="overflow-visible">
          <DialogTitle>Owned nonclipping composition</DialogTitle>
          <DialogDescription>
            Inline content remains adjacent to its trigger, with no parent Escape handshake.
          </DialogDescription>
          <InteractiveHelp />
          <p className="text-sm text-muted">
            This is an explicit composition, not a default change.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
};

function UnsupportedPortalOrder() {
  const [outerContainer, setOuterContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex max-w-lg flex-col items-start gap-4">
      <p className="text-sm text-muted">
        Negative examples: pointer visibility does not imply direct keyboard link order.
      </p>
      <InteractiveHelp label="Body portal: unsupported hover order" container={document.body} />
      <Button variant="ghost">Following control before the body-portal links</Button>
      <InteractiveHelp label="Outer portal: unsupported hover order" container={outerContainer} />
      <Button variant="ghost">Following control before the outer-portal links</Button>
      <div ref={setOuterContainer} />
    </div>
  );
}

export const InteractiveHoverPortalBoundaries: Story = {
  name: "Boundary: Body and Outer Portal Keyboard Order",
  parameters: {
    docs: {
      description: {
        story:
          "Do not default interactive hover help to body or outer-parent portals. In these negative examples, hover a naturally focused trigger and press Tab: the following control occurs before its links and native outside-focus dismissal can close the panel. An explicit portal target is supported only when the caller owns a nonclipping, DOM-adjacent location. Radix alone renders, positions, focuses and dismisses; public Floating UI separately calculates internal safePolygon placement metadata. The native corridor depends on placement side and actual reference/content rectangles, not alignment equivalence between calculations. Root shares requested placement/gap/padding inputs, but two independent placement calculations remain a maintenance obligation through flips and viewport/scroll/boundary changes. No metadata output, floating styles or extra focus manager are applied."
      }
    }
  },
  render: () => <UnsupportedPortalOrder />
};
