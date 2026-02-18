import type { Meta, StoryObj } from "@storybook/react-vite";

import { Switch } from "./Switch";

/**
 * Switches allow users to toggle between two states (on/off).
 * Use switches for binary settings that take effect immediately.
 * The variant determines the color when checked.
 */
const meta = {
  title: "Generic/Switch",
  component: Switch,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
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
      options: ["default", "sm"]
    },
    checked: {
      control: "boolean"
    },
    disabled: {
      control: "boolean"
    }
  },
  args: { checked: false, disabled: false, size: "default" }
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for general switch toggles."
      }
    }
  }
};

export const Neutral: Story = {
  name: "Variant: Neutral",
  args: {
    variant: "neutral",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for neutral or subtle toggles."
      }
    }
  }
};

export const Success: Story = {
  name: "Variant: Success",
  args: {
    variant: "success",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for positive or successful toggles."
      }
    }
  }
};

export const Info: Story = {
  name: "Variant: Info",
  args: {
    variant: "info",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for informational toggles."
      }
    }
  }
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for toggles that warrant attention."
      }
    }
  }
};

export const Danger: Story = {
  name: "Variant: Danger",
  args: {
    variant: "danger",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for destructive or error-related toggles."
      }
    }
  }
};

export const Organization: Story = {
  name: "Variant: Organization",
  args: {
    variant: "org",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for organization scope toggles."
      }
    }
  }
};

export const SubOrganization: Story = {
  name: "Variant: Sub-Organization",
  args: {
    variant: "sub-org",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for sub-organization scope toggles."
      }
    }
  }
};

export const Project: Story = {
  name: "Variant: Project",
  args: {
    variant: "project",
    checked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for project scope toggles."
      }
    }
  }
};

export const Unchecked: Story = {
  name: "State: Unchecked",
  args: {
    variant: "outline",
    checked: false
  },
  parameters: {
    docs: {
      description: {
        story: "All switches share the same unchecked state regardless of variant."
      }
    }
  }
};

export const Disabled: Story = {
  name: "State: Disabled",
  args: {
    variant: "outline",
    checked: true,
    disabled: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use the `disabled` prop to prevent user interaction."
      }
    }
  }
};

export const SizeDefault: Story = {
  name: "Size: Default",
  args: {
    variant: "project",
    checked: true,
    size: "default"
  },
  parameters: {
    docs: {
      description: {
        story: "The default size for most use cases."
      }
    }
  }
};

export const SizeSmall: Story = {
  name: "Size: Small",
  args: {
    variant: "project",
    checked: true,
    size: "sm"
  },
  parameters: {
    docs: {
      description: {
        story: "Use the small size for compact layouts or inline toggles."
      }
    }
  }
};
