import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from "@tanstack/react-router";
import {
  BanIcon,
  BoxesIcon,
  BoxIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleXIcon,
  ExternalLinkIcon,
  GlobeIcon,
  InfoIcon,
  RadarIcon,
  TriangleAlertIcon
} from "lucide-react";

import { Badge } from "./Badge";

/**
 * Badges act as an indicator that can optionally be made interactable.
 * You can place text and icons inside a badge.
 * Badges are often used for the indication of a status, state or scope.
 */
const meta = {
  title: "Generic/Badge",
  component: Badge,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["neutral", "success", "info", "warning", "danger", "project", "org", "sub-org"]
    },
    isTruncatable: {
      table: {
        disable: true
      }
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
  args: { children: "Badge", isTruncatable: false }
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {
  name: "Variant: Neutral",
  args: {
    variant: "neutral",
    children: (
      <>
        <BanIcon />
        Disabled
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant when indicating neutral or disabled states."
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
        story: "Use this variant when indicating successful or healthy states."
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
        story:
          "Use this variant when indicating informational states or linking to external references."
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
        story: "Use this variant when indicating activity or attention warranting states."
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
        story: "Use this variant when indicating destructive or error states."
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
        <GlobeIcon />
        Organization
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant when indicating organization scope or links."
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
        <BoxesIcon />
        Sub-Organization
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant when indicating sub-organization scope or links."
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
        <BoxIcon />
        Project
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant when indicating project scope or links."
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
      <a href="https://infisical.com/">
        Link <ExternalLinkIcon />
      </a>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use the `asChild` prop with an `a` tag to use a badge as an external link."
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
        <RadarIcon />
        Secret Scanning
      </Link>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use the `asChild` prop with a `Link` component to use a badge as an internal link."
      }
    }
  }
};

export const AsButton: Story = {
  name: "Example: As Button",
  args: {
    variant: "org",
    asChild: true,
    children: (
      <button type="button" onClick={() => alert("button clicked")}>
        <GlobeIcon />
        Organization
        <ChevronsUpDownIcon />
      </button>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the `asChild` prop with a `button` tag to use a badge as a button. Do not use a styled `Button` component."
      }
    }
  }
};

export const IsTruncatable: Story = {
  name: "Example: isTruncatable",
  args: {
    isTruncatable: true,
    children: (
      <>
        <GlobeIcon />
        <span>Infisical Infrastructure</span>
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the `isTruncatable` prop with a `span` tag wrapping the text content to support truncation."
      }
    }
  },
  decorators: (Story) => (
    <div className="flex w-32">
      <Story />
    </div>
  )
};
