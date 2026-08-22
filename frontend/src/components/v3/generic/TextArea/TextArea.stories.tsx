import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "../Field";
import { TextArea } from "./TextArea";

/**
 * `TextArea` is the v3 multi-line text control. It renders a styled native
 * `<textarea>`, forwards every standard HTML textarea attribute, and adds one
 * custom prop — `isError` — which flips `aria-invalid` and applies the danger
 * border + focus ring (matching `Input`).
 *
 * The control auto-grows with the user's input — setting `rows` is rarely
 * needed, just let the content drive the height. For labels, helper text, and
 * validation errors, compose with `Field` / `FieldLabel` / `FieldDescription` /
 * `FieldError` from `../Field` rather than re-inventing the layout.
 *
 * The component fills its parent's width by design — let the parent (`Field`,
 * `FieldGroup`, or a custom container) decide how wide the textarea should be.
 */
const meta = {
  title: "Generic/TextArea",
  component: TextArea,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outlined"]
    },
    rows: {
      control: "number"
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
    variant: "default",
    placeholder: "Tell us a little about your team...",
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
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline empty textarea with placeholder text. The control auto-grows as the user types — only set `rows` when you specifically want to cap the starting height."
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
          "Detached outline treatment for selected onboarding and authentication flows. Use the default variant for ordinary product forms."
      }
    }
  }
};

export const Disabled: Story = {
  name: "State: Disabled",
  args: {
    defaultValue:
      "We use Infisical to manage secrets across our staging and production environments.",
    disabled: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "`disabled` removes the textarea from the tab order and pointer interaction while softening its border and text. Use for fields that aren't available in the current state — but prefer `readOnly` when the value is still meaningful and copy-able."
      }
    }
  }
};

export const Readonly: Story = {
  name: "State: Readonly",
  args: {
    defaultValue:
      "This description was set by the workspace owner and cannot be edited from this view. Reach out to an admin if it needs to change.",
    readOnly: true
  },
  parameters: {
    docs: {
      description: {
        story:
          "`readOnly` keeps the textarea focusable and selectable but blocks edits. Only its border is softened; the value remains full-strength because it is still meaningful and part of the form. Use for derived or immutable values (audit notes, owner-set descriptions)."
      }
    }
  }
};

export const WithError: Story = {
  name: "State: Error",
  args: {
    defaultValue: "no",
    isError: true
  },
  parameters: {
    docs: {
      description: {
        story:
          'Setting `isError` flips `aria-invalid="true"`, which (a) styles the textarea with the danger border + ring and (b) lets assistive tech announce the error. Always render a paired `FieldError` so sighted users get the explanation too — see *Example: With Validation Error*.'
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
          "The minimum accessible pairing: a `Field` wrapper, a `FieldLabel` whose `htmlFor` matches the `TextArea`'s `id`, and the `TextArea` itself. Don't ship raw textareas without a label — use `aria-label` only when a visible label is genuinely impossible."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="textarea-with-label">Workspace description</FieldLabel>
      <TextArea id="textarea-with-label" placeholder="What is this workspace for?" />
    </Field>
  )
};

export const WithDescription: Story = {
  name: "Example: With Description",
  parameters: {
    docs: {
      description: {
        story:
          "Add `FieldDescription` below the textarea for helper text — format hints, character-count guidance, or cross-references. Keep it short; long-form guidance belongs in docs, not the form."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="textarea-with-description">Reason for access</FieldLabel>
      <TextArea
        id="textarea-with-description"
        placeholder="Briefly describe why this access is required..."
      />
      <FieldDescription>
        Visible to approvers in the audit log. Markdown is not rendered.
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
          "The standard validation pattern: `isError` on the textarea + a `FieldError` below it. `FieldError` accepts a string (shown here) or a `react-hook-form` `errors` array — duplicate messages are de-duplicated and multiple distinct messages render as a bulleted list."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="textarea-with-validation-error">Reason for access</FieldLabel>
      <TextArea id="textarea-with-validation-error" defaultValue="no" isError />
      <FieldError>Provide at least 20 characters of context for the auditor.</FieldError>
    </Field>
  )
};

export const ErrorAnimation: Story = {
  name: "Example: Error Animation",
  parameters: {
    docs: {
      description: {
        story:
          "Submit the form to transition the textarea into its invalid state. The shell shakes once while the error message appears below it. Reset the example before submitting again to replay the transition."
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
          <FieldLabel htmlFor="textarea-error-animation">Reason for access</FieldLabel>
          <TextArea id="textarea-error-animation" defaultValue="no" isError={isError} />
          <FieldError isOpen={isError}>
            Provide at least 20 characters of context for the auditor.
          </FieldError>
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
          "Stack a `TextArea` alongside other fields in a `FieldGroup` for consistent vertical rhythm and to share the container-query context that `Field`'s `responsive` orientation depends on. Common in detail forms where a description sits below a name and identifier."
      }
    }
  },
  render: () => (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="group-workspace-name">Workspace name</FieldLabel>
        <TextArea id="group-workspace-name" rows={1} defaultValue="Acme Production" />
      </Field>
      <Field>
        <FieldLabel htmlFor="group-workspace-description">Description</FieldLabel>
        <TextArea
          id="group-workspace-description"
          defaultValue="Production secrets for the Acme web app and worker pool. Owned by platform-eng."
        />
        <FieldDescription>Shown on the workspace overview and in audit exports.</FieldDescription>
      </Field>
    </FieldGroup>
  )
};
