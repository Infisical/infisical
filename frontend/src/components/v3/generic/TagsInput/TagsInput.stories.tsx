import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Field, FieldDescription, FieldError, FieldLabel } from "../Field";
import { TagsInput } from "./TagsInput";

/**
 * `TagsInput` captures a list of short strings the user types, one chip per value. Use it wherever a
 * field holds several free-form entries — hosts, path prefixes, audiences — instead of a comma-separated
 * text box the reader has to parse by eye.
 *
 * A chip is always valid: `validateTag` runs on commit, and a returned reason refuses the value and
 * leaves it in the draft input rather than creating a chip that has to be marked wrong afterwards. Pass
 * the same validator the form schema uses, so the field and the schema cannot disagree.
 *
 * `separators` are the characters that commit besides `Enter`, and the characters a pasted string is
 * split on. A newline always splits. Pass `separators={[]}` when the separator would be a legal
 * character in the value, as a comma is inside a URL path.
 */
const meta = {
  title: "Generic/TagsInput",
  component: TagsInput,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { value: [], onValueChange: () => undefined },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    )
  ],
  globals: { backgrounds: { value: "card" } }
} satisfies Meta<typeof TagsInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const hostError = (host: string, existing: string[]) => {
  if (host.includes("/")) return `"${host}" must not include a path or scheme.`;
  if (existing.includes(host)) return `"${host}" is listed more than once.`;
  return null;
};

export const Default: Story = {
  render: () => {
    const [hosts, setHosts] = useState(["api.datadoghq.com"]);

    return (
      <Field>
        <FieldLabel htmlFor="hosts">Hosts</FieldLabel>
        <TagsInput
          id="hosts"
          value={hosts}
          onValueChange={setHosts}
          placeholder="api.example.com"
        />
        <FieldDescription>Wildcards like *.example.com are allowed.</FieldDescription>
      </Field>
    );
  }
};

/**
 * A refused value stays in the input with the reason underneath, so nothing is committed that the form
 * would only reject later.
 */
export const Validated: Story = {
  render: () => {
    const [hosts, setHosts] = useState(["api.datadoghq.com"]);
    const [reason, setReason] = useState<string | null>(null);

    return (
      <Field>
        <FieldLabel htmlFor="validated-hosts">Hosts</FieldLabel>
        <TagsInput
          id="validated-hosts"
          value={hosts}
          onValueChange={setHosts}
          validateTag={hostError}
          onValidationError={setReason}
          isError={Boolean(reason)}
          placeholder="api.example.com"
        />
        <FieldError errors={[reason ? { message: reason } : undefined]} />
      </Field>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");

    await userEvent.type(input, "https://foo.com/path,", { delay: 10 });
    await expect(canvas.getByText(/must not include a path or scheme/)).toBeInTheDocument();
    await expect(input).toHaveValue("https://foo.com/path");

    await userEvent.clear(input);
    await userEvent.type(input, "uploads.datadoghq.com,", { delay: 10 });
    await expect(canvas.getByText("uploads.datadoghq.com")).toBeInTheDocument();
    await expect(input).toHaveValue("");
  }
};

/**
 * With `separators={[]}` only `Enter`, `Tab` and blur commit, so a comma stays part of the value. A
 * pasted string still splits on newlines.
 */
export const NoSeparator: Story = {
  render: () => {
    const [paths, setPaths] = useState(["/repos"]);

    return (
      <Field>
        <FieldLabel htmlFor="paths">Path prefixes</FieldLabel>
        <TagsInput
          id="paths"
          value={paths}
          onValueChange={setPaths}
          separators={[]}
          placeholder="/repos"
        />
        <FieldDescription>Every path is allowed when none is added.</FieldDescription>
      </Field>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");

    await userEvent.type(input, "/v1/metrics,logs{Enter}", { delay: 10 });
    await expect(canvas.getByText("/v1/metrics,logs")).toBeInTheDocument();
  }
};

export const Disabled: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="disabled-hosts">Hosts</FieldLabel>
      <TagsInput
        id="disabled-hosts"
        value={["api.datadoghq.com", "*.datadoghq.eu"]}
        onValueChange={() => undefined}
        isDisabled
      />
    </Field>
  )
};
