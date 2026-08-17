import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogOutIcon, TrashIcon } from "lucide-react";

import { Button } from "../Button";
import { Field } from "../Field";
import { Input } from "../Input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogConfirmationLabel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from "./AlertDialog";

/**
 * AlertDialogs are modal confirmation dialogs for irreversible or high-consequence actions —
 * use them when the user must explicitly acknowledge an operation before it proceeds.
 * Compose an alert dialog from `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`
 * (with optional `AlertDialogMedia`, `AlertDialogTitle`, and `AlertDialogDescription`), and
 * `AlertDialogFooter` (with `AlertDialogCancel` and `AlertDialogAction`).
 *
 * Do not use an AlertDialog for informational messages — prefer `Alert` or a non-modal toast.
 */
const meta = {
  title: "Generic/AlertDialog",
  component: AlertDialog,
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
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline confirmation dialog — a trigger opens a modal with title, description, and a Cancel / Continue footer. Use this composition when the action is reversible or low-consequence."
      }
    }
  },
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Continue</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Continue to the next step?</AlertDialogTitle>
          <AlertDialogDescription>
            You can return to this step later from the workspace settings page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
};

export const DestructiveAction: Story = {
  name: "Example: Destructive Action",
  parameters: {
    docs: {
      description: {
        story:
          'Use `variant="danger"` on `AlertDialogAction` when the confirmed action is destructive or irreversible. The trigger Button typically matches the action\'s tone.'
      }
    }
  },
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="danger">
          <TrashIcon />
          Delete workspace
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the workspace, all of its secrets, and revoke access for
            every member. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
};

export const WithMedia: Story = {
  name: "Example: With Media",
  parameters: {
    docs: {
      description: {
        story:
          "Add an `AlertDialogMedia` icon slot above (mobile) or beside (desktop) the title to reinforce the action's tone. Mirrors the 'Remove Override' confirmation pattern in the Secrets dashboard."
      }
    }
  },
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <TrashIcon />
          Remove override
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TrashIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove Override</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove this personal override? The shared secret value will be
            used instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger">Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
};

export const SmallSize: Story = {
  name: "Example: Small Size",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `size="sm"` to `AlertDialogContent` for a compact dialog — header content remains left-aligned and footer actions split into a two-column grid. Use for short, single-sentence confirmations.'
      }
    }
  },
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <LogOutIcon />
          Revoke session
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <LogOutIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Revoke session?</AlertDialogTitle>
          <AlertDialogDescription>
            This device will be signed out immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel isFullWidth>Cancel</AlertDialogCancel>
          <AlertDialogAction isFullWidth variant="danger">
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
};

const CONFIRMATION_KEYWORD = "delete";

const TypedConfirmationStory = () => {
  const [confirmation, setConfirmation] = useState("");
  const isConfirmed = confirmation === CONFIRMATION_KEYWORD;

  return (
    <AlertDialog onOpenChange={(open) => !open && setConfirmation("")}>
      <AlertDialogTrigger asChild>
        <Button variant="danger">
          <TrashIcon />
          Delete project
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the project and all of its secrets, integrations, and audit
            history. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogConfirmationField>
          <Field>
            <AlertDialogConfirmationLabel
              htmlFor="alert-dialog-confirmation"
              confirmationValue={CONFIRMATION_KEYWORD}
            />
            <Input
              id="alert-dialog-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </AlertDialogConfirmationField>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger" isDisabled={!isConfirmed}>
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const TypedConfirmation: Story = {
  name: "Example: Typed Confirmation",
  parameters: {
    docs: {
      description: {
        story:
          "Compose `AlertDialogConfirmationField`, `Field`, and `AlertDialogConfirmationLabel` with an `Input` that requires either a fixed keyword or the resource name before the destructive action is enabled. Pass that required value to `confirmationValue` so the label owns the confirmation sentence and styling."
      }
    }
  },
  render: () => <TypedConfirmationStory />
};
