import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AsteriskIcon,
  BanIcon,
  CheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  InfoIcon,
  RadarIcon,
  TriangleAlertIcon,
  UserIcon
} from "lucide-react";

import { OrgIcon, ProjectIcon, SubOrgIcon } from "../../platform";
import { UnstableButton } from "./Button";

/**
 * Buttons act as an indicator that can optionally be made interactable.
 * You can place text and icons inside a Button.
 * Buttons are often used for the indication of a status, state or scope.
 */
const meta = {
  title: "Generic/Button",
  component: UnstableButton,
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
    as: {
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
} satisfies Meta<typeof UnstableButton>;

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
          "Use this variant when other Button variants are not applicable or as the key when displaying key-value pairs with ButtonGroup."
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
          "Use this variant when other Button variants are not applicable or as the value when displaying key-value pairs with ButtonGroup."
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
    as: "a",
    href: "https://www.infisical.com",
    children: (
      <>
        Link <ExternalLinkIcon />
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Use the `as="a"` prop to use a Button as an external `a` tag component.'
      }
    }
  }
};

export const AsRouterLink: Story = {
  name: "Example: As Router Link",
  args: {
    variant: "project",
    as: "link",
    children: (
      <>
        <RadarIcon />
        Secret Scanning
      </>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Use the `as="link"` prop to use a Button as an internal `Link` component.'
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
          "Use the `isFullWidth` prop to expand the Buttons width to fill it's parent container."
      }
    }
  },
  decorators: (Story) => (
    <div className="w-32">
      <Story />
    </div>
  )
};
