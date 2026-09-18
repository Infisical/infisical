import * as React from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import { AlertDescription, AlertTitle } from "./Alert";
import { DismissableAlert } from "./DismissableAlert";

const getStorageKey = (actionKey: string) => `infisical:dismissed-alert:${actionKey}`;

const withSeededDismissal = (actionKey: string, dismissed = false): Decorator =>
  function SeededDismissalDecorator(Story) {
    const storageKey = getStorageKey(actionKey);
    if (dismissed) {
      localStorage.setItem(storageKey, "true");
    } else {
      localStorage.removeItem(storageKey);
    }

    React.useEffect(() => () => localStorage.removeItem(storageKey), [storageKey]);

    return <Story />;
  };

/**
 * An Alert the user can permanently dismiss. The dismissal is persisted per
 * browser profile through local storage, so the notice stays hidden across
 * reloads on that browser. Dismissing collapses the alert with the standard
 * 200ms motion before it unmounts.
 *
 * These stories seed local storage so each renders deterministically.
 */
const meta = {
  title: "Generic/DismissableAlert",
  component: DismissableAlert,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "info", "success", "warning", "danger", "project", "org", "sub-org"]
    },
    actionKey: {
      control: false
    },
    children: {
      table: {
        disable: true
      }
    },
    className: {
      table: {
        disable: true
      }
    }
  },
  args: {
    className: "w-[500px]"
  }
} satisfies Meta<typeof DismissableAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MigrationNotice: Story = {
  name: "Example: Migration Notice",
  args: {
    variant: "info",
    actionKey: "storybook_migration_notice_dismissed"
  },
  decorators: [withSeededDismissal("storybook_migration_notice_dismissed")],
  parameters: {
    docs: {
      description: {
        story:
          "The primary use case: a one-time notice the user reads and closes. Click the X to play the dismissal collapse; in the app the dismissal also persists, so the notice never returns."
      }
    }
  },
  render: (args) => (
    <DismissableAlert {...args}>
      <InfoIcon />
      <AlertTitle>Secret Sharing Has Moved</AlertTitle>
      <AlertDescription>
        Secret Sharing now lives in its own product tab in the sidebar.
      </AlertDescription>
    </DismissableAlert>
  )
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning",
    actionKey: "storybook_warning_notice_dismissed"
  },
  decorators: [withSeededDismissal("storybook_warning_notice_dismissed")],
  parameters: {
    docs: {
      description: {
        story:
          "Every Alert variant passes through. Reserve dismissable warnings for one-time notices; a state the user must resolve should stay permanent instead."
      }
    }
  },
  render: (args) => (
    <DismissableAlert {...args}>
      <TriangleAlertIcon />
      <AlertTitle>Service tokens are deprecated.</AlertTitle>
      <AlertDescription>
        Existing tokens keep working, but new integrations should use machine identities.
      </AlertDescription>
    </DismissableAlert>
  )
};

export const AlreadyDismissed: Story = {
  name: "Example: Already Dismissed",
  args: {
    variant: "info",
    actionKey: "storybook_already_dismissed_notice"
  },
  decorators: [withSeededDismissal("storybook_already_dismissed_notice", true)],
  parameters: {
    docs: {
      description: {
        story:
          "Once the local-storage entry exists (seeded here), the component renders nothing at all: no reserved space, no placeholder. The dashed frame is story chrome to make the absence visible."
      }
    }
  },
  render: (args) => (
    <div className="w-[500px] rounded-md border border-dashed border-border p-3 text-xs text-foreground/50">
      Already-dismissed notices render nothing:
      <DismissableAlert {...args}>
        <InfoIcon />
        <AlertTitle>You should never see this notice.</AlertTitle>
      </DismissableAlert>
    </div>
  )
};
