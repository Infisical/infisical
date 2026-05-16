import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from "@tanstack/react-router";
import {
  BoxesIcon as SubOrgIcon,
  BoxIcon as ProjectIcon,
  Building2Icon as OrgIcon,
  CheckIcon,
  CircleXIcon,
  EditIcon,
  ExternalLinkIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SettingsIcon,
  TriangleAlertIcon
} from "lucide-react";

import { IconButton } from "./IconButton";

/**
 * IconButtons are square single-glyph buttons — use them for toolbar actions, row
 * actions, and compact triggers where text would be redundant. Share the same
 * variant palette as `Button` so a `Button` + `IconButton` pair (e.g. a split
 * button) reads as a single connected control.
 *
 * Always provide an `aria-label` on icon-only buttons — the screen reader has no
 * visible text to announce.
 */
const meta = {
  title: "Generic/IconButton",
  component: IconButton,
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
        "ghost",
        "ghost-muted",
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
    isDisabled: {
      control: "boolean"
    },
    isFullWidth: {
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
  args: {
    "aria-label": "Action",
    isPending: false,
    isDisabled: false,
    size: "md"
  }
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Variant: Default",
  args: {
    variant: "default",
    "aria-label": "Confirm",
    children: <CheckIcon />
  },
  parameters: {
    docs: {
      description: {
        story:
          "Filled foreground button — the most emphatic variant. Use sparingly for the single primary action in a cluster."
      }
    }
  }
};

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline",
    "aria-label": "More",
    children: <MoreHorizontalIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Use for general-purpose toolbar actions that sit alongside `outline` Buttons."
      }
    }
  }
};

export const Ghost: Story = {
  name: "Variant: Ghost",
  args: {
    variant: "ghost",
    "aria-label": "Edit",
    children: <EditIcon />
  },
  parameters: {
    docs: {
      description: {
        story:
          "Borderless button that only shows a background on hover — use inside dense rows or next to content where an outline would be visual noise."
      }
    }
  }
};

export const GhostMuted: Story = {
  name: "Variant: Ghost Muted",
  args: {
    variant: "ghost-muted",
    "aria-label": "Edit",
    children: <PencilIcon />
  },
  parameters: {
    docs: {
      description: {
        story:
          "Same borderless treatment as `ghost` but with a muted icon color until hover. Use for secondary actions that shouldn't draw the eye at rest — like inline edit pencils in detail panels."
      }
    }
  }
};

export const Success: Story = {
  name: "Variant: Success",
  args: {
    variant: "success",
    "aria-label": "Approve",
    children: <CheckIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Use for productive confirmations like approve / accept actions."
      }
    }
  }
};

export const Info: Story = {
  name: "Variant: Info",
  args: {
    variant: "info",
    "aria-label": "Info",
    children: <InfoIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Use for informational triggers — help tooltips, documentation links, details."
      }
    }
  }
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning",
    "aria-label": "Warning",
    children: <TriangleAlertIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Use for attention-warranting triggers that aren't yet destructive."
      }
    }
  }
};

export const Danger: Story = {
  name: "Variant: Danger",
  args: {
    variant: "danger",
    "aria-label": "Remove",
    children: <CircleXIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Use for destructive triggers — remove, delete, revoke."
      }
    }
  }
};

export const Organization: Story = {
  name: "Variant: Organization",
  args: {
    variant: "org",
    "aria-label": "Organization",
    children: <OrgIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Scope-tinted variant for organization-level actions."
      }
    }
  }
};

export const SubOrganization: Story = {
  name: "Variant: Sub-Organization",
  args: {
    variant: "sub-org",
    "aria-label": "Sub-organization",
    children: <SubOrgIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Scope-tinted variant for sub-organization-level actions."
      }
    }
  }
};

export const Project: Story = {
  name: "Variant: Project",
  args: {
    variant: "project",
    "aria-label": "Project",
    children: <ProjectIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Scope-tinted variant for project-level actions."
      }
    }
  }
};

export const AsExternalLink: Story = {
  name: "Example: As External Link",
  args: {
    variant: "ghost",
    asChild: true,
    "aria-label": "Open documentation",
    children: (
      <a target="_blank" rel="noopener noreferrer" href="https://infisical.com/">
        <ExternalLinkIcon />
      </a>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use `asChild` with an `<a>` to render the icon button as an external link."
      }
    }
  }
};

export const AsRouterLink: Story = {
  name: "Example: As Router Link",
  args: {
    variant: "outline",
    asChild: true,
    "aria-label": "Settings",
    children: (
      <Link to=".">
        <SettingsIcon />
      </Link>
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Use `asChild` with a TanStack `Link` to render the icon button as an internal link."
      }
    }
  }
};

export const IsPending: Story = {
  name: "Example: isPending",
  args: {
    variant: "outline",
    isPending: true,
    "aria-label": "Saving",
    children: <CheckIcon />
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use `isPending` to show a loading spinner inside the button and disable interaction. The Lottie spinner swaps to a dark version automatically for the filled `default` variant."
      }
    }
  }
};

export const IsDisabled: Story = {
  name: "Example: isDisabled",
  args: {
    variant: "outline",
    isDisabled: true,
    "aria-label": "Edit",
    children: <EditIcon />
  },
  parameters: {
    docs: {
      description: {
        story: "Use `isDisabled` to block interaction and mute the button to 50% opacity."
      }
    }
  }
};
