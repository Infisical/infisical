import type { Meta, StoryObj } from "@storybook/react-vite";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "../../generic/Button";
import { AccessRestrictedDialog } from "./AccessRestrictedDialog";

const meta = {
  title: "Platform/Access Restricted Dialog",
  component: AccessRestrictedDialog,
  parameters: {
    layout: "padded"
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-6xl">
        <Story />
      </div>
    )
  ],
  tags: ["autodocs"]
} satisfies Meta<typeof AccessRestrictedDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use as the page- or tab-level permission gate: a dialog-look panel floating over a redacted stand-in for the gated content. It renders in normal document flow, so the surrounding page chrome stays usable by both pointer and keyboard."
      }
    }
  }
};

export const WithRequirement: Story = {
  name: "Example: With Requirement",
  args: {
    requirement: {
      action: "read",
      subject: "audit-logs"
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass the missing CASL action/subject so an operator can hand the exact permission to whoever edits their role. Permission gates derive this via toPermissionRequirement."
      }
    }
  }
};

export const WithAction: Story = {
  name: "Example: With Action",
  args: {
    requirement: {
      action: "read",
      subject: "project"
    },
    action: <Button variant="project">Request Access</Button>
  },
  parameters: {
    docs: {
      description: {
        story:
          "Surfaces with a self-serve flow (e.g. request access) can append a call to action after the standard navigation buttons. The footer gives it the remaining row width and stacks it when the panel is narrow."
      }
    }
  }
};

export const CustomCopy: Story = {
  name: "Example: Custom Copy",
  args: {
    description: "Only project admins can view and manage certificate approval policies."
  },
  parameters: {
    docs: {
      description: {
        story: "Override the description when the page has a more specific access rule."
      }
    }
  }
};

export const Prerequisite: Story = {
  name: "Example: Prerequisite",
  args: {
    title: "Upgrade your secrets engine to view your project dashboard.",
    subtitle: null,
    description: "Upgrade this project before viewing its secrets in the UI.",
    badgeIcon: <TriangleAlertIcon />,
    badgeLabel: "Upgrade Required",
    docsUrl: null,
    showGoBack: false,
    action: (
      <Button variant="project" isFullWidth>
        Upgrade Secrets Engine
      </Button>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Customize the badge, omit the access-control link, and hide history-based navigation when a page is gated by a prerequisite rather than a missing permission."
      }
    }
  }
};
