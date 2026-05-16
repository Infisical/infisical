import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle
} from "../Field";
import { Label } from "../Label";
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
  args: { isChecked: false, isDisabled: false },
  globals: {
    backgrounds: { value: "card" }
  }
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

export const Indeterminate: Story = {
  name: "State: Indeterminate",
  args: {
    variant: "outline",
    isIndeterminate: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isIndeterminate` for the mixed-selection state — used by parent checkboxes when only some children are selected. The minus icon replaces the check, signaling 'partial' rather than 'on' or 'off'."
      }
    }
  }
};

export const WithLabel: Story = {
  name: "Example: With Label",
  parameters: {
    docs: {
      description: {
        story:
          "The minimum accessible pairing — a `Label` whose `htmlFor` matches the `Checkbox`'s `id`. Clicking the label toggles the checkbox."
      }
    }
  },
  render: () => (
    <div className="flex w-80 items-center gap-3">
      <Checkbox id="checkbox-terms" />
      <Label htmlFor="checkbox-terms">I agree to the terms of service</Label>
    </div>
  )
};

export const WithDescription: Story = {
  name: "Example: With Description",
  parameters: {
    docs: {
      description: {
        story:
          "Pair a `Checkbox` with `FieldTitle` and `FieldDescription` inside a horizontal `Field` for the canonical settings-row layout — checkbox on the left, title and helper text on the right."
      }
    }
  },
  render: () => (
    <Field orientation="horizontal" className="w-[420px]">
      <Checkbox id="checkbox-deploy" defaultChecked />
      <FieldContent>
        <FieldTitle>Deploy events</FieldTitle>
        <FieldDescription>
          Email me when a deploy completes, fails, or is rolled back.
        </FieldDescription>
      </FieldContent>
    </Field>
  )
};

function WithValidationErrorRender() {
  const [accepted, setAccepted] = useState(false);
  return (
    <Field className="w-[420px]">
      <Field orientation="horizontal">
        <Checkbox
          id="checkbox-terms-required"
          isChecked={accepted}
          onCheckedChange={(next) => setAccepted(next === true)}
          isError={!accepted}
        />
        <FieldContent>
          <FieldTitle>I agree to the terms of service</FieldTitle>
          <FieldDescription>
            By checking this box you consent to our terms and privacy policy.
          </FieldDescription>
        </FieldContent>
      </Field>
      {!accepted && <FieldError>You must accept the terms to continue.</FieldError>}
    </Field>
  );
}

export const WithValidationError: Story = {
  name: "Example: With Validation Error",
  parameters: {
    docs: {
      description: {
        story:
          'Setting `isError` flips `aria-invalid="true"` on the `Checkbox`, which paints the danger border and lets assistive tech announce the error — same contract as `Input`. Pair with a `FieldError` for required-acknowledgement flows (terms, policies, destructive confirmations); the error clears as soon as the user checks the box.'
      }
    }
  },
  render: () => <WithValidationErrorRender />
};

export const InFieldSet: Story = {
  name: "Example: In Field Set",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap related boolean controls in a `FieldSet` with a `FieldLegend` for semantic grouping — the legend acts as a single accessible label for the entire set. The canonical layout for a notifications, permissions, or feature-flag picker."
      }
    }
  },
  render: () => (
    <FieldSet className="w-[420px]">
      <FieldLegend>Notifications</FieldLegend>
      <FieldDescription>Choose which events should email you.</FieldDescription>
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox id="notify-deploys" defaultChecked />
          <FieldContent>
            <FieldTitle>Deploy events</FieldTitle>
            <FieldDescription>When a deploy completes, fails, or is rolled back.</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="notify-access" />
          <FieldContent>
            <FieldTitle>Access changes</FieldTitle>
            <FieldDescription>When roles or permissions change for this project.</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="notify-billing" defaultChecked />
          <FieldContent>
            <FieldTitle>Billing updates</FieldTitle>
            <FieldDescription>Invoices, plan changes, and usage alerts.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
};
