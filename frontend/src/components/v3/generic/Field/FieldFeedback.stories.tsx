import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../Button";
import { Input } from "../Input";
import { Field, FieldLabel } from "./Field";
import { FieldFeedback } from "./FieldFeedback";

const meta = {
  title: "Generic/Field/FieldFeedback",
  component: FieldFeedback,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Provides one animated message slot beneath a form control. Use it when helper text should be replaced by validation feedback instead of rendering both messages. The wrapper ID associates both states with the control through `aria-describedby`; errors use an alert role. Message and height transitions respect reduced-motion preferences."
      }
    }
  },
  argTypes: {
    className: {
      table: {
        disable: true
      }
    }
  },
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof FieldFeedback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Description",
  args: {
    id: "field-feedback-default-message",
    description: "Leave blank to allow any email domain."
  },
  render: (args) => (
    <Field className="w-96">
      <FieldLabel htmlFor="field-feedback-default">Allowed email domains</FieldLabel>
      <Input
        id="field-feedback-default"
        aria-describedby="field-feedback-default-message"
        placeholder="acme.com, example.com"
      />
      <FieldFeedback {...args} />
    </Field>
  )
};

export const FeedbackTransition: Story = {
  name: "Behavior: Description to Error",
  parameters: {
    docs: {
      description: {
        story:
          "Toggle the validation state to see the helper text exit before error feedback occupies the same message slot. The field and control expose their invalid state separately; `FieldFeedback` owns only the message transition and announcement."
      }
    }
  },
  render: function Render() {
    const [hasError, setHasError] = useState(false);

    return (
      <Field className="w-96" data-invalid={hasError}>
        <FieldLabel htmlFor="field-feedback-transition">Allowed email domains</FieldLabel>
        <Input
          id="field-feedback-transition"
          aria-describedby="field-feedback-transition-message"
          value={hasError ? "anthropic" : ""}
          isError={hasError}
          readOnly
        />
        <FieldFeedback
          id="field-feedback-transition-message"
          description="Leave blank to allow any email domain."
          error={
            hasError
              ? "Enter a complete domain such as anthropic.com. Protocols and paths are not supported."
              : undefined
          }
        />
        <Button type="button" variant="outline" onClick={() => setHasError((current) => !current)}>
          {hasError ? "Clear error" : "Show error"}
        </Button>
      </Field>
    );
  }
};
