import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field, FieldDescription, FieldError, FieldLabel } from "../Field";
import { ColorPicker } from "./ColorPicker";

/**
 * `ColorPicker` is the v3 hex color control. It pairs a monospaced `Input` for
 * typing or pasting a hex value with a swatch button that opens a `Popover`
 * containing a 2D color picker (HSL square + hue slider, via `react-colorful`).
 *
 * The component is controlled — pass `value` and `onChange` together. The
 * swatch and picker only react to syntactically-valid six-digit hex
 * (`#RRGGBB`), but the input accepts free-form text so users can paste,
 * partially edit, or clear the value without the swatch flickering.
 *
 * For labels, helper text, and validation errors, compose with `Field` /
 * `FieldLabel` / `FieldDescription` / `FieldError` from `../Field` — same
 * pattern as `Input`.
 *
 * Reach for `ColorPicker` when the user is choosing an arbitrary brand or
 * theme color (tag colors, custom theme accents). For a fixed palette of
 * options (status colors, severity tiers), present a `Select` or radio group
 * instead.
 */
const meta = {
  title: "Generic/ColorPicker",
  component: ColorPicker,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: "text"
    },
    placeholder: {
      control: "text"
    },
    disabled: {
      control: "boolean"
    },
    isError: {
      control: "boolean"
    },
    className: {
      table: { disable: true }
    },
    onChange: {
      table: { disable: true }
    }
  },
  args: {
    placeholder: "#000000",
    disabled: false,
    isError: false
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline empty picker — the input is empty, the swatch is unfilled. Click the swatch to open the picker, type or paste into the input to set a value directly. Toggle controls in the panel to play with state."
      }
    }
  },
  render: (args) => <ColorPicker {...args} />
};

export const WithValue: Story = {
  name: "State: With Value",
  args: {
    value: "#3b82f6"
  },
  parameters: {
    docs: {
      description: {
        story:
          "When the input holds a valid `#RRGGBB` value, the swatch fills with that color and the picker opens centered on it. Used for editing an existing tag, a previously-saved theme accent, or any field that has a known starting color."
      }
    }
  },
  render: (args) => <ColorPicker {...args} />
};

export const Disabled: Story = {
  name: "State: Disabled",
  args: {
    value: "#10b981",
    disabled: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "`disabled` blocks both the input and the swatch — the popover can't open, the input drops out of the tab order, and the whole control dims. Use when the field is contextually unavailable (no entitlement, dependent on another field)."
      }
    }
  },
  render: (args) => <ColorPicker {...args} />
};

export const WithError: Story = {
  name: "State: Error",
  args: {
    value: "not-a-color",
    isError: true
  },
  parameters: {
    docs: {
      description: {
        story:
          'Setting `isError` flips `aria-invalid="true"` on the input, which paints the danger border + ring and lets assistive tech announce the error. The swatch stays unfilled until the value parses as a valid hex. Always pair with a `FieldError` so sighted users get the explanation — see *Example: With Validation Error*.'
      }
    }
  },
  render: (args) => <ColorPicker {...args} />
};

function ControlledRender() {
  const [color, setColor] = useState("#7c3aed");
  return (
    <div className="flex flex-col gap-3 text-sm text-foreground">
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex items-center gap-2 text-accent">
        Selected: <code>{color || "—"}</code>
      </div>
    </div>
  );
}

export const Controlled: Story = {
  name: "Example: Controlled",
  parameters: {
    docs: {
      description: {
        story:
          "The canonical usage: pair `value` with `onChange` so the parent owns the color state. Reach for this pattern in form libraries (`react-hook-form` `Controller`), in derived UI that previews the chosen color, or anywhere you need to react to changes."
      }
    }
  },
  render: () => <ControlledRender />
};

export const WithLabel: Story = {
  name: "Example: With Label",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap the picker in a `Field` with a `FieldLabel` for the minimum accessible pairing. The label points at the input by default, so clicking it focuses the typeable hex value rather than opening the popover."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel>Tag color</FieldLabel>
      <ColorPicker />
    </Field>
  )
};

export const WithDescription: Story = {
  name: "Example: With Description",
  parameters: {
    docs: {
      description: {
        story:
          "Add a `FieldDescription` below the picker for guidance on what the color is for or where it will appear. Keep it short — a one-line explanation, not a usage manual."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel>Brand accent</FieldLabel>
      <ColorPicker />
      <FieldDescription>
        Used as the primary accent across the audit log header and CSV exports.
      </FieldDescription>
    </Field>
  )
};

function WithValidationErrorRender() {
  const [color, setColor] = useState("zzzz");
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(color);
  return (
    <Field>
      <FieldLabel>Tag color</FieldLabel>
      <ColorPicker value={color} onChange={setColor} isError={!isValid} />
      {!isValid && <FieldError>Enter a six-digit hex value (e.g. #3b82f6).</FieldError>}
    </Field>
  );
}

export const WithValidationError: Story = {
  name: "Example: With Validation Error",
  parameters: {
    docs: {
      description: {
        story:
          "The standard validation pattern: `isError` on the picker + a `FieldError` below it. Wire the error state to your validator (here, a regex test against `#RRGGBB`) so the error clears as soon as the user types a valid hex."
      }
    }
  },
  render: () => <WithValidationErrorRender />
};
