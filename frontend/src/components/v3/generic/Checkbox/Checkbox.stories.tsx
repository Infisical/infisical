import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "./Checkbox";

/**
 * Checkboxes allow users to select one or more items from a set.
 * Use checkboxes when users need to see all available options at once.
 * The variant determines the color when checked.
 */
const meta = {
  title: "Generic/Checkbox",
  component: Checkbox,
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
    isChecked: {
      control: "boolean"
    },
    isDisabled: {
      control: "boolean"
    }
  },
  args: { isChecked: false, isDisabled: false }
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for general checkbox selections."
      }
    }
  }
};

export const Neutral: Story = {
  name: "Variant: Neutral",
  args: {
    variant: "neutral",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for neutral or disabled-style selections."
      }
    }
  }
};

export const Success: Story = {
  name: "Variant: Success",
  args: {
    variant: "success",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for positive or successful selections."
      }
    }
  }
};

export const Info: Story = {
  name: "Variant: Info",
  args: {
    variant: "info",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for informational selections."
      }
    }
  }
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for selections that warrant attention."
      }
    }
  }
};

export const Danger: Story = {
  name: "Variant: Danger",
  args: {
    variant: "danger",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for destructive or error-related selections."
      }
    }
  }
};

export const Organization: Story = {
  name: "Variant: Organization",
  args: {
    variant: "org",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for organization scope selections."
      }
    }
  }
};

export const SubOrganization: Story = {
  name: "Variant: Sub-Organization",
  args: {
    variant: "sub-org",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for sub-organization scope selections."
      }
    }
  }
};

export const Project: Story = {
  name: "Variant: Project",
  args: {
    variant: "project",
    isChecked: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use this variant for project scope selections."
      }
    }
  }
};

export const Unchecked: Story = {
  name: "State: Unchecked",
  args: {
    variant: "outline",
    isChecked: false
  },
  parameters: {
    docs: {
      description: {
        story: "All checkboxes share the same unchecked state regardless of variant."
      }
    }
  }
};

export const Disabled: Story = {
  name: "State: Disabled",
  args: {
    variant: "outline",
    isChecked: true,
    isDisabled: true
  },
  parameters: {
    docs: {
      description: {
        story: "Use the `disabled` prop to prevent user interaction."
      }
    }
  }
};
