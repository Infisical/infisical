import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { emailListSchema } from "@app/helpers/email";

import { Field, FieldDescription, FieldError, FieldLabel } from "../../generic/Field";
import { EmailInput } from "./EmailInput";

/**
 * `EmailInput` is the one field for entering email addresses. It builds on `TagsInput`: Enter, a
 * comma, a space or blur turns the draft into a chip, and a pasted list is split on commas,
 * semicolons and whitespace. Addresses are lowercased and deduplicated as they arrive.
 *
 * A malformed address is kept as a flagged chip rather than refused, so a pasted list never loses
 * entries silently. The form decides whether that blocks submission: validate the value with
 * `emailListSchema` from `@app/helpers/email`, which uses the same `isValidEmail` check, and render
 * its message in `FieldError`.
 */
const meta = {
  title: "Platform/EmailInput",
  component: EmailInput,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    onValueChange: () => undefined
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    )
  ],
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof EmailInput>;

export default meta;
type Story = StoryObj;

const schema = emailListSchema({ max: 100, isRequired: true });

const DefaultRender = ({ initial }: { initial: string[] }) => {
  const [value, setValue] = useState<string[]>(initial);
  const result = schema.safeParse(value);
  const error = result.success ? undefined : result.error.issues[0].message;

  return (
    <Field data-invalid={error ? "true" : undefined}>
      <FieldLabel htmlFor="email-input-default">Emails</FieldLabel>
      <EmailInput
        id="email-input-default"
        value={value}
        onValueChange={setValue}
        isError={Boolean(error)}
        placeholder="email@example.com, email2@example.com"
      />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription>Paste a list or press Enter after each address.</FieldDescription>
      )}
    </Field>
  );
};

export const Default: Story = {
  render: () => <DefaultRender initial={["alex@example.com", "sam@example.com"]} />
};

/** Invalid addresses stay visible as flagged chips, and the schema message names them. */
export const InvalidAddresses: Story = {
  name: "Example: Invalid Addresses",
  render: () => <DefaultRender initial={["alex@example.com", "not-an-email", "sam@example"]} />
};

/** A pasted list is split, lowercased and deduplicated, and a half-typed address next to it is kept. */
export const PasteList: Story = {
  name: "Example: Paste a List",
  render: () => <DefaultRender initial={[]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");

    await userEvent.type(input, "jordan@acme.io");
    await userEvent.paste("Alex@Example.com, sam@example.com\nalex@example.com");

    await expect(canvas.getByText("jordan@acme.io")).toBeVisible();
    await expect(canvas.getByText("alex@example.com")).toBeVisible();
    await expect(canvas.getByText("sam@example.com")).toBeVisible();
  }
};
