import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  InfoIcon,
  LogInIcon,
  TriangleAlertIcon
} from "lucide-react";

import { OrgIcon, ProjectIcon, SubOrgIcon } from "../../platform";
import { Button } from "./Button";

/**
 * Buttons trigger actions or events when clicked or pressed.
 * You can place text and icons inside a button.
 * Buttons are often used for submitting forms, navigating between pages, or triggering specific actions.
 */
const meta = {
  title: "Generic/Button",
  component: Button,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "outline",
        "neutral",
        "success",
        "info",
        "warning",
        "danger",
        "project",
        "org",
        "sub-org"
      ]
    },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"]
    },
    isPending: {
      control: "boolean"
    },
    isFullWidth: {
      control: "boolean"
    },
    isDisabled: {
      control: "boolean"
    },
    asChild: {
      table: {
        disable: true
      }
    },
    children: {
      table: {
        disable: true
      }
    }
  },
  args: { children: "Button", isPending: false, isDisabled: false, isFullWidth: false, size: "md" }
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline",
    children: <>Outline</>
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for general page actions."
      }
    }
  }
};

export const Neutral: Story = {
  name: "Variant: Neutral",
  args: {
    variant: "neutral",
    children: (
      <>
        <ArrowLeftIcon />
        Back
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for general actions. [TBD]"
      }
    }
  }
};

export const Ghost: Story = {
  name: "Variant: Ghost",
  args: {
    variant: "ghost",
    children: <>Cancel</>
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for optional / non-primary actions."
      }
    }
  }
};

export const Success: Story = {
  name: "Variant: Success",
  args: {
    variant: "success",
    children: (
      <>
        <CheckIcon />
        Success
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for generic positive / productive call-to-action functionality."
      }
    }
  }
};

export const Info: Story = {
  name: "Variant: Info",
  args: {
    variant: "info",
    children: (
      <>
        <InfoIcon />
        Info
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for generic informational call-to-action functionality."
      }
    }
  }
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning",
    children: (
      <>
        <TriangleAlertIcon />
        Warning
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for buttons with disruptive actions."
      }
    }
  }
};

export const Danger: Story = {
  name: "Variant: Danger",
  args: {
    variant: "danger",
    children: (
      <>
        <CircleXIcon />
        Danger
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for buttons with destructive action."
      }
    }
  }
};

export const Organization: Story = {
  name: "Variant: Organization",
  args: {
    variant: "org",
    children: (
      <>
        <OrgIcon />
        Organization
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for organization scope call-to-action buttons."
      }
    }
  }
};

export const SubOrganization: Story = {
  name: "Variant: Sub-Organization",
  args: {
    variant: "sub-org",
    children: (
      <>
        <SubOrgIcon />
        Sub-Organization
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for sub-organization scope call-to-action buttons."
      }
    }
  }
};

export const Project: Story = {
  name: "Variant: Project",
  args: {
    variant: "project",
    children: (
      <>
        <ProjectIcon />
        Project
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for project scope call-to-action buttons."
      }
    }
  }
};

export const AsExternalLink: Story = {
  name: "Example: As External Link",
  args: {
    variant: "info",
    asChild: true,
    children: (
      <a target="_blank" rel="noopener noreferrer" href="https://infisical.com/">
        Link <ExternalLinkIcon />
      </a>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use the `asChild` prop with an `a` tag to use a button as an external link."
      }
    }
  }
};

export const AsRouterLink: Story = {
  name: "Example: As Router Link",
  args: {
    variant: "project",
    asChild: true,
    children: (
      <Link to=".">
        <ProjectIcon />
        View Project
      </Link>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use the `asChild` prop with a `Link` component to use a button as an internal link."
      }
    }
  }
};

export const IsFullWidth: Story = {
  name: "Example: isFullWidth",
  args: {
    variant: "neutral",
    isFullWidth: true,
    children: (
      <>
        Login
        <LogInIcon />
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use the `isFullWidth` prop to expand button width to fill it's parent container."
      }
    }
  },
  decorators: (Story) => (
    <div className="w-64">
      <Story />
    </div>
  )
};

export const IsPending: Story = {
  name: "Example: isPending",
  args: {
    variant: "neutral",
    isPending: true,
    children: (
      <>
        Login
        <LogInIcon />
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the `isPending` prop to indicate loading states and disable button functionality."
      }
    }
  }
};
