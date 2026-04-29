import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { Input } from "../Input";
import { Label } from "../Label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./Dialog";

/**
 * Dialog renders a general-purpose modal — title, description, arbitrary body
 * content, and a footer. Built on Radix so it supports Esc / overlay click
 * dismissal and includes a close button by default. Use `Dialog` for content
 * and form flows; use `AlertDialog` for destructive confirmations that require
 * explicit acknowledgement.
 */
const meta = {
  title: "Generic/Dialog",
  component: Dialog,
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
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline modal — trigger opens a dialog with title, description, and a Cancel / Continue footer. `DialogClose` wraps the Cancel button so it dismisses the modal without custom state."
      }
    }
  },
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open dialog</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Anyone with this link will be able to view the shared content.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
};

export const WithForm: Story = {
  name: "Example: With Form",
  parameters: {
    docs: {
      description: {
        story:
          "Embed form fields inside `DialogContent` for create / edit flows. Keep the description short and place inputs between the header and footer — the dialog's grid layout gives consistent `gap-4` spacing between sections."
      }
    }
  },
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Edit profile</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update your display name and contact email. Changes apply immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dialog-name">Name</Label>
            <Input id="dialog-name" defaultValue="Scott Wilson" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dialog-email">Email</Label>
            <Input id="dialog-email" type="email" defaultValue="scott@infisical.com" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
};

export const WithoutCloseButton: Story = {
  name: "Example: Without Close Button",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `showCloseButton={false}` to `DialogContent` to hide the top-right X. Use when the user must take a deliberate action in the footer (e.g. a required step in onboarding) rather than abandoning the flow."
      }
    }
  },
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Start onboarding</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Welcome to Infisical</DialogTitle>
          <DialogDescription>
            Let&apos;s set up your first project. This takes about two minutes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Skip for now</Button>
          </DialogClose>
          <Button>Get started</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
};

export const ScrollableContent: Story = {
  name: "Example: Scrollable Content",
  parameters: {
    docs: {
      description: {
        story:
          "For long content, wrap the body in a scrollable container with `max-h-[...] overflow-y-auto`. The header and footer stay anchored while the middle scrolls — common for terms, changelogs, and audit log previews."
      }
    }
  },
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">View terms</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Terms of service</DialogTitle>
          <DialogDescription>Please review the terms before continuing.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-64 thin-scrollbar flex-col gap-3 overflow-y-auto text-sm text-foreground">
          {Array.from({ length: 10 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <p key={i}>
              <span className="font-medium">Section {i + 1}.</span> Lorem ipsum dolor sit amet,
              consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
              magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi
              ut aliquip ex ea commodo consequat.
            </p>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Decline</Button>
          </DialogClose>
          <Button>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
};
