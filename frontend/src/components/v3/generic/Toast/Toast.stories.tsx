import { createPortal } from "react-dom";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

import { Button, type ButtonProps } from "../Button";
import { Toaster } from "./Toast";

/**
 * Toasts surface transient, post-action feedback that does not interrupt the user's flow.
 * Trigger them imperatively with `toast` from `sonner`; the `<Toaster />` (mounted once near
 * the app root) renders them. The toast type sets the semantic tone (a tinted surface, a
 * matching border, and a colored icon) while title and description stay neutral.
 *
 * In the app, prefer the `createNotification` helper from `@app/components/notifications`,
 * which maps our payloads onto this component.
 */

// sonner renders inline (it does not portal) and scopes toasts to a Toaster by `id`. In
// Storybook's aggregated docs view each story mounts its own Toaster, so an unscoped toast
// would appear in every example and get clipped inside the story frame. Each story therefore
// renders a Toaster scoped to a unique id and portaled to the document body, so its toast
// shows exactly once, at the viewport corner.
const ToastExample = ({
  toasterId,
  variant,
  label,
  onShow
}: {
  toasterId: string;
  variant: ButtonProps["variant"];
  label: string;
  onShow: (toasterId: string) => void;
}) => (
  <>
    <Button variant={variant} onClick={() => onShow(toasterId)}>
      {label}
    </Button>
    {createPortal(<Toaster id={toasterId} />, document.body)}
  </>
);

const meta = {
  title: "Generic/Toast",
  component: Toaster,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"]
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  name: "Variant: Success",
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant to confirm a completed action. Keep the copy past tense and specific."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-success"
      variant="success"
      label="Show Success Toast"
      onShow={(toasterId) => toast.success('Secret "API_KEY" created', { toasterId })}
    />
  )
};

export const Info: Story = {
  name: "Variant: Info",
  parameters: {
    docs: {
      description: {
        story: "Use this variant for neutral, informational feedback such as a copy confirmation."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-info"
      variant="info"
      label="Show Info Toast"
      onShow={(toasterId) => toast.info("Request ID copied to clipboard", { toasterId })}
    />
  )
};

export const Warning: Story = {
  name: "Variant: Warning",
  parameters: {
    docs: {
      description: {
        story: "Use this variant to flag an attention-warranting state the user should notice."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-warning"
      variant="warning"
      label="Show Warning Toast"
      onShow={(toasterId) => toast.warning("Access token expires in 24 hours", { toasterId })}
    />
  )
};

export const ErrorToast: Story = {
  name: "Variant: Error",
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant to surface a failure. Name the failure and the remedy in the description."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-error"
      variant="danger"
      label="Show Error Toast"
      onShow={(toasterId) =>
        toast.error("Could not rotate secret", {
          description: "Token lacks the secrets:write permission.",
          toasterId
        })
      }
    />
  )
};

export const Default: Story = {
  name: "Variant: Default",
  parameters: {
    docs: {
      description: {
        story: "Use this variant for neutral messages that do not warrant a semantic tone."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-default"
      variant="outline"
      label="Show Default Toast"
      onShow={(toasterId) => toast("Syncing started", { toasterId })}
    />
  )
};

export const WithDescription: Story = {
  name: "Example: With Description",
  parameters: {
    docs: {
      description: {
        story:
          "Add a description for a second line of supporting detail. The title stays the prominent line."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-description"
      variant="success"
      label="Show Toast With Description"
      onShow={(toasterId) =>
        toast.success("Integration connected", {
          description: "Secrets will begin syncing to the target environment within a minute.",
          toasterId
        })
      }
    />
  )
};

export const WithAction: Story = {
  name: "Example: With Action",
  parameters: {
    docs: {
      description: {
        story: "Pair a toast with a single follow-up action, such as undoing the change just made."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-action"
      variant="outline"
      label="Show Toast With Action"
      onShow={(toasterId) =>
        toast("Secret value updated", {
          description: "The previous value was archived.",
          toasterId,
          action: {
            label: "Undo",
            onClick: () => toast.success("Reverted to previous value", { toasterId })
          }
        })
      }
    />
  )
};

export const PromiseToast: Story = {
  name: "Example: Promise",
  parameters: {
    docs: {
      description: {
        story:
          "Drive the toast from a promise to reflect an async operation's lifecycle: loading, then success or error."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-promise"
      variant="info"
      label="Show Promise Toast"
      onShow={(toasterId) =>
        toast.promise(
          new Promise<void>((resolve) => {
            setTimeout(resolve, 2000);
          }),
          {
            loading: "Rotating secret...",
            success: "Secret rotated",
            error: "Rotation failed",
            toasterId
          }
        )
      }
    />
  )
};

export const Persistent: Story = {
  name: "Example: Persistent",
  parameters: {
    docs: {
      description: {
        story:
          "Set `duration: Infinity` to keep a toast until the user dismisses it. Use sparingly for states that must be acknowledged."
      }
    }
  },
  render: () => (
    <ToastExample
      toasterId="toast-persistent"
      variant="warning"
      label="Show Persistent Toast"
      onShow={(toasterId) =>
        toast.warning("Connection lost", {
          description: "Reconnect to resume syncing secrets.",
          duration: Infinity,
          toasterId
        })
      }
    />
  )
};
