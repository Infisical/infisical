import { useId, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EllipsisIcon } from "lucide-react";

import { Button } from "../Button";
import { Combobox } from "../Combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../Dropdown";
import { Field, FieldLabel } from "../Field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../HoverCard";
import { IconButton } from "../IconButton";
import { Input } from "../Input";
import { Label } from "../Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../Select";
import { Separator } from "../Separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../Tooltip";
import {
  Dialog,
  DialogBody,
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

export const FixedHeight: Story = {
  name: "Variant: Fixed Height",
  parameters: {
    docs: {
      description: {
        story:
          'Use height="fixed" for changing content such as announcement slides. The dialog reserves 40rem, capped to the available viewport height. Keep scrolling content in DialogBody and actions in DialogFooter; the default padding, spacing, and footer styling are preserved.'
      }
    }
  },
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Fixed Height Dialog</Button>
      </DialogTrigger>
      <DialogContent height="fixed">
        <DialogHeader>
          <DialogTitle>What&apos;s New</DialogTitle>
          <DialogDescription>Review the latest updates.</DialogDescription>
        </DialogHeader>
        <DialogBody>Short content keeps the same dialog height as longer content.</DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
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
          "Embed form fields inside `DialogContent` for create / edit flows. Keep the description short and place inputs between the header and footer — the padded shell gives each section consistent spacing while the footer breaks out to the dialog edges."
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
            <Input id="dialog-email" type="email" defaultValue="jane@infisical.com" />
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
          "`DialogContent` is capped to the available viewport height. Put long content in `DialogBody` so the middle owns scrolling while the padded header and full-width footer remain anchored. Portaled selects, popovers, and tooltips can still escape the scroll region."
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
        <DialogBody className="flex flex-col">
          <Separator />
          <div className="flex flex-col gap-3 py-4 text-sm text-foreground">
            {Array.from({ length: 10 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <p key={i}>
                <span className="font-medium">Section {i + 1}.</span> Lorem ipsum dolor sit amet,
                consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
                magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
                nisi ut aliquip ex ea commodo consequat.
              </p>
            ))}
          </div>
          <Separator />
        </DialogBody>
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

export const AlternativeScroll: Story = {
  name: "Alternative: Scrollable Body",
  parameters: {
    docs: {
      description: {
        story:
          "An alternative scroll composition keeps the header, body, and footer in one scroll flow while the sticky footer remains visible at the bottom. Use this when the footer should follow the content naturally but remain available during scrolling."
      }
    }
  },
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open scroll dialog</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Project details</DialogTitle>
          <DialogDescription>Review the project information before continuing.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-none flex-col gap-3 overflow-visible text-sm text-foreground">
          {Array.from({ length: 12 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <p key={i}>
              <span className="font-medium">Detail {i + 1}.</span> This content remains inside the
              scrollable body while the dialog header and footer stay visible.
            </p>
          ))}
        </DialogBody>
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

export const FormWithExternalFooter: Story = {
  name: "Example: Form With Footer Outside",
  parameters: {
    docs: {
      description: {
        story:
          "Prefer this shape for small Dialog forms (1 to 2 fields) whose content can still grow, such as an expandable advanced section. Multi-field or scrollable forms belong in a Sheet. The `<form>` wraps only the fields, `DialogFooter` stays a direct child of `DialogContent`, and the submit button points at the form with the `form` attribute. The dialog scrolls as one flow and the sticky footer stays at the bottom with content passing flush beneath it, so no scroll or position overrides are needed. Wrapping the footer inside the form still works for short, static content."
      }
    }
  },
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Create Project</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>Name the project and review its settings.</DialogDescription>
        </DialogHeader>
        <form
          id="dialog-external-footer-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => e.preventDefault()}
        >
          {Array.from({ length: 2 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className="flex flex-col gap-2">
              <Label htmlFor={`dialog-external-field-${i}`}>Field {i + 1}</Label>
              <Input id={`dialog-external-field-${i}`} />
            </div>
          ))}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="dialog-external-footer-form">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
};

const ROLES = [
  { slug: "admin", name: "Admin" },
  { slug: "member", name: "Member" },
  { slug: "no-access", name: "No Access" }
];

const NestedPopupsAndPendingCloseRender = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number] | null>(ROLES[1]);
  const [environment, setEnvironment] = useState("production");
  const roleId = useId();
  const environmentId = useId();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Member options" variant="outline">
            <EllipsisIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsOpen(true)}>Edit Member</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent isPending={isPending}>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>
              Escape and outside clicks close the innermost popup first.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              setIsPending(true);
              setTimeout(() => {
                setIsPending(false);
                setIsOpen(false);
              }, 1500);
            }}
          >
            <Field>
              <FieldLabel htmlFor={roleId}>Role</FieldLabel>
              <Combobox
                id={roleId}
                options={ROLES}
                value={role}
                isClearable={false}
                onValueChange={setRole}
                getOptionValue={(option) => option.slug}
                getOptionLabel={(option) => option.name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={environmentId}>Environment</FieldLabel>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger id={environmentId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center gap-4 text-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="link">Tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>Informational tooltip</TooltipContent>
              </Tooltip>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Button variant="link">Hover card</Button>
                </HoverCardTrigger>
                <HoverCardContent>Supplementary details for this member.</HoverCardContent>
              </HoverCard>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="link">Menu</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>Copy Member ID</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="org" isPending={isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const NestedPopupsAndPendingClose: Story = {
  name: "Example: Nested Popups and Pending Close",
  parameters: {
    docs: {
      description: {
        story:
          "Combobox, Select, Tooltip, HoverCard, and DropdownMenu popups inside a Dialog each own the first Escape or outside click; the next one reaches the Dialog. While `isPending` is true, Escape, outside clicks, the close button, and `DialogClose` cannot dismiss the Dialog. Closing returns focus to the control that opened it, including the trigger of a menu whose item opened it."
      }
    }
  },
  render: () => <NestedPopupsAndPendingCloseRender />
};
