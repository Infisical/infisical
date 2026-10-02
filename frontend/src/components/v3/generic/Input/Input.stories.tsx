import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
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
 * `FieldError` from `../Field` rather than re-inventing the layout. Input helper
 * text inherits `FieldDescription`'s default animated-collapse behavior.
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
    variant: {
      control: "select",
      options: ["default", "outlined"]
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
    variant: "default",
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

export const Outlined: Story = {
  args: {
    variant: "outlined"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Detached outline treatment for selected onboarding and authentication flows. Use the default variant for ordinary product forms and search controls."
      }
    }
  }
};

export const Disabled: Story = {
  name: "State: Disabled",
  args: {
    defaultValue: "Unavailable input",
    disabled: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "`disabled` removes the input from the tab order and pointer interaction while softening its border and text. Use for fields that aren't available in the current state — but prefer `readOnly` when the value is still meaningful and copy-able."
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
          "`readOnly` keeps the input focusable and selectable but blocks edits. Only its border is softened; the value remains full-strength because it is still meaningful and part of the form. Use for derived or immutable values (e.g. account email)."
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

export const ErrorAnimation: Story = {
  name: "Example: Error Animation",
  parameters: {
    docs: {
      description: {
        story:
          "Submit the form to transition the input into its invalid state. The shell shakes once while the error message appears below it. Reset the example before submitting again to replay the transition."
      }
    }
  },
  render: function ErrorAnimationRender() {
    const [isError, setIsError] = useState(false);

    return (
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setIsError(true);
        }}
      >
        <Field data-invalid={isError}>
          <FieldLabel htmlFor="input-error-animation">Email</FieldLabel>
          <Input
            id="input-error-animation"
            type="email"
            defaultValue="not-an-email"
            isError={isError}
          />
          <FieldError isOpen={isError}>Enter a valid email address.</FieldError>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" size="sm" isDisabled={isError}>
            Trigger Error
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setIsError(false)}>
            Reset
          </Button>
        </div>
      </form>
    );
  }
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
