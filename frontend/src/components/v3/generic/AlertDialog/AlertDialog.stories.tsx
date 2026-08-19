import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogOutIcon, TrashIcon } from "lucide-react";

import { Alert, AlertDescription } from "../Alert";
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
import { DiscardChangesAlertDialog } from "./DiscardChangesAlertDialog";

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

export const WithAlertDescription: Story = {
  name: "Example: Alert as Description",
  parameters: {
    docs: {
      description: {
        story:
          "Use `AlertDialogDescription asChild` to present the dialog description as an Alert while keeping it programmatically associated with the dialog. This is useful when the consequence needs stronger visual emphasis than supporting text alone."
      }
    }
  },
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="danger">
          <TrashIcon />
          Remove privilege
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove additional privilege?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>
                This policy will no longer grant additional access to this user.
              </AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger">Remove privilege</AlertDialogAction>
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

const DiscardChangesStory = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Close Editor
      </Button>
      <DiscardChangesAlertDialog
        open={open}
        onOpenChange={setOpen}
        onDiscard={() => setOpen(false)}
        title="Discard Changes?"
        description="Your unsaved changes to this configuration will be lost."
      />
    </>
  );
};

export const DiscardChanges: Story = {
  name: "Example: Discard Changes",
  parameters: {
    docs: {
      description: {
        story:
          "Use `DiscardChangesAlertDialog` when dismissing an editor or setup flow would remove unsaved form changes. The owning feature remains responsible for dirty state and reset behavior."
      }
    }
  },
  render: () => <DiscardChangesStory />
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

const PROJECT_NAME = "production-api";

const TypedConfirmationStory = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const isConfirmed = confirmation === PROJECT_NAME;

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isPending) return;
        setIsOpen(open);
        if (!open) setConfirmation("");
      }}
    >
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
              confirmationValue={PROJECT_NAME}
            />
            <Input
              id="alert-dialog-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={PROJECT_NAME}
              autoComplete="off"
              autoFocus
            />
          </Field>
        </AlertDialogConfirmationField>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={isPending}
            isDisabled={!isConfirmed}
            onClick={async (event) => {
              event.preventDefault();
              setIsPending(true);
              await new Promise((resolve) => {
                setTimeout(resolve, 800);
              });
              setIsPending(false);
              setIsOpen(false);
              setConfirmation("");
            }}
          >
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
          "Require the resource name for high-consequence deletion. Pass it to `confirmationValue`, mirror it in the input placeholder, focus the input when the dialog opens, and clear it on close. During an asynchronous action, prevent the default close, show `isPending`, and disable cancellation until the operation completes. A fixed keyword can be used when no stable resource name is available."
      }
    }
  },
  render: () => <TypedConfirmationStory />
};
