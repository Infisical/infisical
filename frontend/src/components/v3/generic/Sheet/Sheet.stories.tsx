import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { Input } from "../Input";
import { Label } from "../Label";
import { Separator } from "../Separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "./Sheet";

/**
 * Sheet renders a slide-over panel anchored to one edge of the viewport — title,
 * description, arbitrary body content, and an optional footer. Built on Radix's
 * Dialog primitive so it supports Esc / overlay click dismissal and includes a
 * close button by default.
 *
 * Reach for `Sheet` (not `Dialog`) when the content is long-form, secondary to
 * the page (e.g. detail panes, navigation drawers, filter panels, edit forms),
 * or when you want the underlying page to remain visually present. Use `Dialog`
 * for short, centered, modal-style interactions.
 */
const meta = {
  title: "Generic/Sheet",
  component: Sheet,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default (Right Side)",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline slide-over — `side` defaults to `right`, the most common placement for detail panes and edit flows. Wrap the footer's Cancel button in `SheetClose` so it dismisses the sheet without managing state. `SheetContent` defaults to a responsive width (`w-3/4` with `sm:max-w-md`); override via `className` when you need more or less room."
      }
    }
  },
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Secret details</SheetTitle>
          <SheetDescription>
            View and update metadata for the selected secret. Changes apply on save.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 text-sm text-foreground">
          <p>
            Place primary content here — the body grows to fill available height between the header
            and footer.
          </p>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
};

export const LeftSide: Story = {
  name: "Example: Left Side",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `side="left"` for navigation drawers and filter panels — the sheet slides in from the leading edge so it reads as supplementary chrome rather than a primary action. Pair with `SheetClose` on individual menu items if selecting one should close the drawer.'
      }
    }
  },
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open filters</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list of secrets by tag and environment.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 text-sm text-foreground">
          <div className="flex items-center justify-between">
            <span>Production</span>
            <span className="text-accent">12</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Staging</span>
            <span className="text-accent">8</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Development</span>
            <span className="text-accent">23</span>
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Reset</Button>
          </SheetClose>
          <Button>Apply</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
};

export const BottomSheet: Story = {
  name: "Example: Bottom Sheet",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `side="bottom"` for mobile-style action sheets — the sheet height auto-fits its content (`h-auto`) rather than spanning the full viewport. Best for short menus of contextual actions where a centered Dialog would feel heavy.'
      }
    }
  },
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Show actions</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Quick actions</SheetTitle>
          <SheetDescription>Choose an action to apply to the selected secret.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          <SheetClose asChild>
            <Button variant="ghost">Copy value</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button variant="ghost">Duplicate</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button variant="ghost">Move to folder</Button>
          </SheetClose>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
};

export const TopSheet: Story = {
  name: "Example: Top Sheet",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `side="top"` for banner-style announcements that slide down from the top of the viewport. The least common variant — reserve it for system-level notices (maintenance windows, breaking changes) where a non-modal alert would be too easy to miss.'
      }
    }
  },
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Show announcement</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Scheduled maintenance</SheetTitle>
          <SheetDescription>
            Infisical will be briefly unavailable on Saturday at 02:00 UTC for a database upgrade.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Dismiss</Button>
          </SheetClose>
          <Button>View details</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
};

export const WithForm: Story = {
  name: "Example: With Form",
  parameters: {
    docs: {
      description: {
        story:
          "Embed form fields between `SheetHeader` and `SheetFooter` for create / edit flows — the canonical use case for a right-side sheet. The header and footer stay anchored as the body grows, so longer forms do not push the primary action off-screen."
      }
    }
  },
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Edit profile</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Update your display name and contact email. Changes apply immediately.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sheet-name">Name</Label>
            <Input id="sheet-name" defaultValue="Scott Wilson" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sheet-email">Email</Label>
            <Input id="sheet-email" type="email" defaultValue="scott@infisical.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sheet-title">Job title</Label>
            <Input id="sheet-title" defaultValue="Software Engineer" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
};

export const ScrollableContent: Story = {
  name: "Example: Scrollable Content",
  parameters: {
    docs: {
      description: {
        story:
          "For long bodies, anchor the header and footer while the middle scrolls — common for activity feeds, audit log details, and changelogs. Wrap the scroll region between two `Separator`s in a single flex column so the rules sit flush against the scrolling content; without the wrapper, `SheetContent`'s gap would push padding between them."
      }
    }
  },
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">View activity</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Recent activity</SheetTitle>
          <SheetDescription>Audit events for this secret over the last 30 days.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <Separator />
          <div className="flex thin-scrollbar flex-1 flex-col gap-3 overflow-y-auto px-4 text-sm text-foreground">
            {Array.from({ length: 12 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="flex flex-col gap-1 border-b border-border pb-3">
                <span className="font-medium">Event {i + 1}</span>
                <span className="text-accent">
                  Secret value updated by scott@infisical.com — {i + 1}h ago.
                </span>
              </div>
            ))}
          </div>
          <Separator />
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Close</Button>
          </SheetClose>
          <Button>Export log</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
};
