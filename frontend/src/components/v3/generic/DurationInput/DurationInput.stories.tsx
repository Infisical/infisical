import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field, FieldDescription, FieldLabel } from "../Field";
import { DurationInput } from "./DurationInput";

/**
 * `DurationInput` captures a duration as an explicit numeric amount and unit while preserving the
 * compact strings used by APIs (`30m`, `2h`, `7d`). Use it instead of a free-form input whenever a
 * person should choose a duration rather than write one in an implementation-specific syntax.
 */
const meta = {
  title: "Generic/DurationInput",
  component: DurationInput,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { value: "1h", onValueChange: () => undefined },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    )
  ],
  globals: { backgrounds: { value: "card" } }
} satisfies Meta<typeof DurationInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState("2h");

    return (
      <Field>
        <FieldLabel htmlFor="duration">Duration</FieldLabel>
        <DurationInput id="duration" value={value} onValueChange={setValue} />
        <FieldDescription>Stored as {value || "an empty value"}.</FieldDescription>
      </Field>
    );
  }
};

export const ConstrainedUnits: Story = {
  render: () => {
    const [value, setValue] = useState("7d");

    return (
      <Field>
        <FieldLabel htmlFor="retention-duration">Retention period</FieldLabel>
        <DurationInput
          id="retention-duration"
          value={value}
          onValueChange={setValue}
          units={["d", "w"]}
          defaultUnit="d"
        />
      </Field>
    );
  }
};

export const Error: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="invalid-duration">Duration</FieldLabel>
      <DurationInput id="invalid-duration" value="" onValueChange={() => undefined} isError />
    </Field>
  )
};

export const Disabled: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="disabled-duration">Duration</FieldLabel>
      <DurationInput id="disabled-duration" value="24h" onValueChange={() => undefined} disabled />
    </Field>
  )
};
