import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TrashIcon } from "lucide-react";

import { Alert, AlertDescription } from "../../generic/Alert";
import { Button } from "../../generic/Button";
import { ConfirmationAlertDialog } from "./ConfirmationAlertDialog";

/**
 * ConfirmationAlertDialog is the canonical typed-confirmation pattern for destructive and other
 * high-consequence actions, such as delete, revoke, or rotate. Use a plain AlertDialog when typed
 * confirmation is not warranted.
 */
const meta = {
  title: "Platform/Confirmation Alert Dialog",
  component: ConfirmationAlertDialog,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    isOpen: false,
    onOpenChange: () => undefined,
    title: "Delete project?",
    confirmKey: "production-api",
    onConfirm: () => undefined
  },
  argTypes: {
    isOpen: {
      table: {
        disable: true
      }
    },
    onOpenChange: {
      table: {
        disable: true
      }
    },
    onConfirm: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof ConfirmationAlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const PROJECT_NAME = "production-api";

const ConfirmationAlertDialogStory = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant="danger" onClick={() => setIsOpen(true)}>
        <TrashIcon />
        Delete Project
      </Button>
      <ConfirmationAlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Delete project?"
        description={
          <Alert variant="danger" appearance="borderless">
            <AlertDescription>
              This permanently removes the project and all of its data. This cannot be undone.
            </AlertDescription>
          </Alert>
        }
        confirmKey={PROJECT_NAME}
        confirmLabel="Delete Project"
        onConfirm={async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, 800);
          });
          setIsOpen(false);
        }}
      />
    </>
  );
};

export const Default: Story = {
  name: "Example: Typed Deletion Confirmation",
  parameters: {
    docs: {
      description: {
        story:
          "Use for destructive deletion or removal actions whose consequences warrant typing a resource name or fixed confirmation value. The dialog owns input reset, focus, form submission, and pending interaction behavior."
      }
    }
  },
  render: () => <ConfirmationAlertDialogStory />
};
