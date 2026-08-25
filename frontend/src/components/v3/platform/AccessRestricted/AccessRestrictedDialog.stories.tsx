import type { Meta, StoryObj } from "@storybook/react-vite";

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
          "Surfaces with a self-serve flow (e.g. request access) can append a call to action after the standard navigation buttons."
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
