import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronLeftIcon, FingerprintIcon, PlusIcon } from "lucide-react";

import { ProjectType } from "@app/hooks/api/projects/types";

import { Button } from "../../generic/Button";
import { PageHeader, type TPageHeaderScope } from "./PageHeader";

const meta = {
  title: "Platform/Page Header",
  component: PageHeader,
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
  tags: ["autodocs"],
  args: {
    scope: ProjectType.SecretManager,
    title: "Project Overview"
  }
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const SCOPES: { label: string; scope: NonNullable<TPageHeaderScope> }[] = [
  { label: "Organization", scope: "org" },
  { label: "Namespace", scope: "namespace" },
  { label: "Instance", scope: "instance" },
  { label: "Secret Manager Project", scope: ProjectType.SecretManager },
  { label: "Certificate Manager Project", scope: ProjectType.CertificateManager },
  { label: "KMS Project", scope: ProjectType.KMS },
  { label: "Secret Scanning Project", scope: ProjectType.SecretScanning },
  { label: "PAM Project", scope: ProjectType.PAM }
];

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story: "Use a project-scoped header as the standard heading for project pages."
      }
    }
  }
};

export const SupportedScopes: Story = {
  name: "Example: Supported Scopes",
  render: () => (
    <div className="flex flex-col gap-10">
      {SCOPES.map(({ label, scope }) => (
        <PageHeader key={scope} scope={scope} title={label} className="mb-0" />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Each supported scope resolves to its canonical icon, icon color, and title decoration."
      }
    }
  }
};

export const NoScope: Story = {
  name: "Example: No Scope",
  args: {
    scope: null,
    title: "Account Settings"
  },
  parameters: {
    docs: {
      description: {
        story: "Use a null scope for pages that do not belong to an Infisical resource scope."
      }
    }
  }
};

export const CustomIcon: Story = {
  name: "Example: Custom Icon",
  args: {
    scope: null,
    icon: FingerprintIcon,
    title: "Identity Details"
  },
  parameters: {
    docs: {
      description: {
        story: "Provide a custom Lucide icon when the page represents a specific resource."
      }
    }
  }
};

export const WithDescriptionAndActions: Story = {
  name: "Example: Description and Actions",
  args: {
    title: "Project Access Control",
    description:
      "Manage fine-grained access for users, groups, roles, and machine identities within your project resources.",
    children: (
      <Button variant="project">
        <PlusIcon />
        Add Member
      </Button>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Descriptions provide page context while children render page-level actions on the right."
      }
    }
  }
};

export const WithBackLink: Story = {
  name: "Example: Back Link",
  args: {
    backLink: (
      <a href="#page-header-stories">
        <ChevronLeftIcon aria-hidden className="size-4" />
        All Projects
      </a>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass a native anchor or router link to render consistent back navigation above the page title."
      }
    }
  }
};

export const LongTitle: Story = {
  name: "Example: Long Title",
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl">
        <Story />
      </div>
    )
  ],
  args: {
    title:
      "A Project Title That Is Intentionally Long Enough to Demonstrate Truncation Beside Page Actions",
    description: "The title remains on one line while the action stays visible.",
    children: <Button variant="project">Create Secret</Button>
  },
  parameters: {
    docs: {
      description: {
        story: "Long titles truncate before they displace the page action."
      }
    }
  }
};
