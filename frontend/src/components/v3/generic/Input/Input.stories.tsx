import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "../Field";
import { Input } from "./Input";

/**
 * `Input` is the v3 single-line text control. It renders a styled native `<input>`,
 * forwards every standard HTML input attribute, and adds one custom prop — `isError` —
 * which flips `aria-invalid` and applies the danger border + focus ring.
 *
 * Use the native `type` attribute for browser-native UX (email keyboards, password
 * masking, native date pickers, file selectors). For labels, helper text, and
 * validation errors, compose with `Field` / `FieldLabel` / `FieldDescription` /
 * `FieldError` from `../Field` rather than re-inventing the layout.
 *
 * The component fills its parent's width by design — let the parent (`Field`,
 * `FieldGroup`, or a custom container) decide how wide the input should be.
 */
const meta = {
  title: "Generic/Input",
  component: Input,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "date", "url", "search", "tel", "file"]
    },
    isError: {
      control: "boolean"
    },
    disabled: {
      control: "boolean"
    },
    readOnly: {
      control: "boolean"
    },
    placeholder: {
      control: "text"
    },
    className: {
      table: { disable: true }
    }
  },
  args: {
    type: "text",
    placeholder: "Enter text...",
    isError: false,
    disabled: false,
    readOnly: false
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    )
  ],
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline empty input with placeholder text. Use as the starting point for any text input — toggle `type` in the controls panel for specialised browser UX (email, password, number, date, file, etc.)."
      }
    }
  }
};

export const Disabled: Story = {
  name: "State: Disabled",
  args: {
    defaultValue: "Read-only via disabled",
    disabled: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "`disabled` removes the input from the tab order, dims it, and signals non-interactivity through the cursor. Use for fields that aren't editable in the current state — but prefer `readOnly` when the value is still meaningful and copy-able."
      }
    }
  }
};

export const Readonly: Story = {
  name: "State: Readonly",
  args: {
    defaultValue: "john@infisical.com",
    readOnly: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "`readOnly` keeps the input focusable and selectable but blocks edits. It looks visually identical to a normal input — that's intentional, since the value is still part of the form. Use for derived or immutable values (e.g. account email)."
      }
    }
  }
};

export const WithError: Story = {
  name: "State: Error",
  args: {
    type: "email",
    defaultValue: "not-an-email",
    isError: true
  },
  parameters: {
    docs: {
      description: {
        story:
          'Setting `isError` flips `aria-invalid="true"`, which (a) styles the input with the danger border + ring and (b) lets assistive tech announce the error. Always render a paired `FieldError` so sighted users get the explanation too — see *Example: With Validation Error*.'
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
          "The minimum accessible pairing: a `Field` wrapper, a `FieldLabel` whose `htmlFor` matches the `Input`'s `id`, and the `Input` itself. Don't ship raw inputs without a label — use `aria-label` only when a visible label is genuinely impossible."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="input-with-label">Workspace name</FieldLabel>
      <Input id="input-with-label" placeholder="Acme Corporation" />
    </Field>
  )
};

export const WithDescription: Story = {
  name: "Example: With Description",
  parameters: {
    docs: {
      description: {
        story:
          "Add `FieldDescription` below the input for helper text — the *why* behind the field, format hints, or cross-references. Keep it short; long-form guidance belongs in docs, not the form."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="input-with-description">API endpoint</FieldLabel>
      <Input id="input-with-description" type="url" placeholder="https://api.example.com" />
      <FieldDescription>
        Fully qualified URL including protocol. We&apos;ll send signed requests to this host.
      </FieldDescription>
    </Field>
  )
};

export const WithValidationError: Story = {
  name: "Example: With Validation Error",
  parameters: {
    docs: {
      description: {
        story:
          "The standard validation pattern: `isError` on the input + a `FieldError` below it. `FieldError` accepts a string (shown here) or a `react-hook-form` `errors` array — duplicate messages are de-duplicated and multiple distinct messages render as a bulleted list."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="input-with-validation-error">Email</FieldLabel>
      <Input id="input-with-validation-error" type="email" defaultValue="not-an-email" isError />
      <FieldError>Enter a valid email address.</FieldError>
    </Field>
  )
};

export const InFieldGroup: Story = {
  name: "Example: In Field Group",
  parameters: {
    docs: {
      description: {
        story:
          "Stack multiple inputs in a `FieldGroup` for consistent vertical rhythm and to share the container-query context that `Field`'s `responsive` orientation depends on. This is the canonical layout for almost every form in the product."
      }
    }
  },
  render: () => (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="group-name">Full name</FieldLabel>
        <Input id="group-name" defaultValue="Scott Wilson" />
      </Field>
      <Field>
        <FieldLabel htmlFor="group-email">Email</FieldLabel>
        <Input id="group-email" type="email" defaultValue="john@infisical.com" />
        <FieldDescription>Used for sign-in and critical notifications.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="group-role">Role</FieldLabel>
        <Input id="group-role" defaultValue="Admin" disabled />
      </Field>
    </FieldGroup>
  )
};
