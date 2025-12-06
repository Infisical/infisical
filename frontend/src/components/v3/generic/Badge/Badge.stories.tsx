import type { Meta, StoryObj } from "@storybook/react-vite";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  AsteriskIcon,
  BanIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleXIcon,
  ExternalLinkIcon,
  GlobeIcon,
  InfoIcon,
  RadarIcon,
  TriangleAlertIcon,
  UserIcon
} from "lucide-react";

import { OrgIcon, ProjectIcon, SubOrgIcon } from "../../platform";
import { UnstableButtonGroup } from "../ButtonGroup";
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
    isTruncatable: {
      table: {
        disable: true
      }
    },
    isFullWidth: {
      table: {
        disable: true
      }
    },
    isSquare: {
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

export const Default: Story = {
  name: "Variant: Default",
  args: {
    variant: "default",
    children: <>Default</>
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant when other badge variants are not applicable or as the key when displaying key-value pairs with ButtonGroup."
      }
    }
  }
};

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline",
    children: <>Outline</>
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant when other badge variants are not applicable or as the value when displaying key-value pairs with ButtonGroup."
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

export const Ghost: Story = {
  name: "Variant: Ghost",
  args: {
    variant: "ghost",
    children: (
      <>
        <UserIcon />
        User
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use this variant when indicating a configuration or property value. Avoid using this variant as an interactive element as it is not intuitive to interact with."
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
          "Use this variant when indicating informational states or when linking to external documentation."
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
        <OrgIcon />
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
        <SubOrgIcon />
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
        <ProjectIcon />
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
      <a target="_blank" rel="noopener noreferrer" href="https://infisical.com/">
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
      <button type="button" onClick={() => console.log("click")}>
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
    variant: "org",
    isTruncatable: true,
    children: (
      <>
        <OrgIcon />
        <span>Infisical Infrastructure</span>
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the `isTruncatable` prop with a `span` tag wrapping the text content to support truncation. Parent `div` should have a fixed width and `flex` class."
      }
    }
  },
  decorators: (Story) => (
    <div className="flex w-32">
      <Story />
    </div>
  )
};

export const IsSquare: Story = {
  name: "Example: isSquare",
  args: {
    variant: "danger",
    isSquare: true,
    children: <AlertTriangleIcon />
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the `isSquare` prop when displaying a squared badge with 1-2 character text or only an icon."
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
        <AsteriskIcon />
        Secret Value
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the `isFullWidth` prop to expand the badges width to fill it's parent container."
      }
    }
  },
  decorators: (Story) => (
    <div className="w-32">
      <Story />
    </div>
  )
};

export const KeyValuePair: Story = {
  name: "Example: Key-Value Pair",
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          "Use a default and outline badge in conjunction with the `<ButtonGroup />` component to display key-value pairs."
      }
    }
  },
  decorators: () => (
    <UnstableButtonGroup>
      <Badge>Key</Badge>
      <Badge variant="outline">Value</Badge>
    </UnstableButtonGroup>
  )
};
