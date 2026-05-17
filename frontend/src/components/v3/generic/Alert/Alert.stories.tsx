import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BoxesIcon as SubOrgIcon,
  BoxIcon as ProjectIcon,
  Building2Icon as OrgIcon,
  CheckIcon,
  CircleXIcon,
  InfoIcon,
  TriangleAlertIcon
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "./Alert";

/**
 * Alerts surface short, scannable messages that communicate state or call attention to contextual information.
 * Compose an alert from an optional leading icon, `AlertTitle`, and `AlertDescription`.
 * The `variant` determines the semantic tone of the message.
 */
const meta = {
  title: "Generic/Alert",
  component: Alert,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "info", "success", "warning", "danger", "project", "org", "sub-org"]
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
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Variant: Default",
  args: {
    variant: "default"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant for neutral informational messages that do not warrant a semantic tone."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Your changes have been saved.</AlertTitle>
      <AlertDescription>The new configuration will apply on the next sync.</AlertDescription>
    </Alert>
  )
};

export const Info: Story = {
  name: "Variant: Info",
  args: {
    variant: "info"
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant to highlight helpful context or link to relevant documentation."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <InfoIcon />
      <AlertTitle>Gateway deployment recommended.</AlertTitle>
      <AlertDescription>
        Deploy a gateway in the target network to keep traffic private and avoid public endpoints.
      </AlertDescription>
    </Alert>
  )
};

export const Success: Story = {
  name: "Variant: Success",
  args: {
    variant: "success"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant to confirm a successful or healthy state after an operation completes."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <CheckIcon />
      <AlertTitle>Integration connected.</AlertTitle>
      <AlertDescription>
        Secrets will begin syncing to the target environment within the next minute.
      </AlertDescription>
    </Alert>
  )
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning"
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant to flag attention-warranting states before the user proceeds."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <TriangleAlertIcon />
      <AlertTitle>Access token expires soon.</AlertTitle>
      <AlertDescription>
        This token will expire in 24 hours. Rotate it now to avoid downstream failures.
      </AlertDescription>
    </Alert>
  )
};

export const Danger: Story = {
  name: "Variant: Danger",
  args: {
    variant: "danger"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant to surface errors or destructive consequences the user must acknowledge."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <CircleXIcon />
      <AlertTitle>This action cannot be undone.</AlertTitle>
      <AlertDescription>
        Removing this identity will revoke all active tokens and disable existing integrations.
      </AlertDescription>
    </Alert>
  )
};

export const Project: Story = {
  name: "Variant: Project",
  args: {
    variant: "project"
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant to call out project-scoped information or configuration."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <ProjectIcon />
      <AlertTitle>Project-level override active.</AlertTitle>
      <AlertDescription>
        This project overrides the organization default for secret rotation intervals.
      </AlertDescription>
    </Alert>
  )
};

export const Organization: Story = {
  name: "Variant: Organization",
  args: {
    variant: "org"
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant to call out organization-scoped information or configuration."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <OrgIcon />
      <AlertTitle>Organization-wide policy applies.</AlertTitle>
      <AlertDescription>
        Settings defined at the organization level override project-level defaults.
      </AlertDescription>
    </Alert>
  )
};

export const SubOrganization: Story = {
  name: "Variant: Sub-Organization",
  args: {
    variant: "sub-org"
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant to call out sub-organization-scoped information or configuration."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <SubOrgIcon />
      <AlertTitle>Inherited from sub-organization.</AlertTitle>
      <AlertDescription>
        This configuration is managed by the parent sub-organization and cannot be edited here.
      </AlertDescription>
    </Alert>
  )
};

export const TitleOnly: Story = {
  name: "Example: Title Only",
  args: {
    variant: "info"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Omit `AlertDescription` when the message fits in a single line — the title aligns vertically with the icon."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <InfoIcon />
      <AlertTitle>Sync completed successfully.</AlertTitle>
    </Alert>
  )
};

export const WithoutIcon: Story = {
  name: "Example: Without Icon",
  args: {
    variant: "default"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Omit the leading icon when the variant's tone is conveyed through color alone — the content fills the full width."
      }
    }
  },
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>3 secrets were imported.</AlertTitle>
      <AlertDescription>
        Review the changes in the audit log before sharing access.
      </AlertDescription>
    </Alert>
  )
};
