import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Field, FieldDescription, FieldError, FieldLabel } from "../Field";
import { TagsInput, type TagsInputProps } from "./TagsInput";

const LANGUAGES = ["typescript", "go", "rust"];

/**
 * `TagsInput` collects a list of free-text values as removable chips. It reuses the
 * `Combobox` chip styling so a tag looks the same wherever it appears, but renders no
 * popup: there is nothing to pick from, only what the user types.
 *
 * Enter, a comma or a space commits the draft, and pasting splits on any of those plus
 * newlines, so a list copied from somewhere else arrives as separate tags. Blur commits
 * whatever is left in the box, so a value typed and never confirmed is not lost.
 *
 * Tags are keyed by their text, which means `validateTag` has to refuse duplicates or the
 * list cannot render. Compose with `Field` / `FieldLabel` / `FieldError` for labels and
 * validation text rather than laying that out here.
 */
const meta = {
  title: "Generic/TagsInput",
  component: TagsInput,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    isError: { control: "boolean" },
    isDisabled: { control: "boolean" },
    placeholder: { control: "text" },
    value: { table: { disable: true } },
    className: { table: { disable: true } }
  },
  args: {
    onValueChange: () => undefined
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
} satisfies Meta<typeof TagsInput>;

export default meta;
type Story = StoryObj;

const DefaultRender = ({ isDisabled, isError, placeholder }: Partial<TagsInputProps>) => {
  const [value, setValue] = useState<string[]>(LANGUAGES);

  return (
    <Field
      data-disabled={isDisabled ? "true" : undefined}
      data-invalid={isError ? "true" : undefined}
    >
      <FieldLabel htmlFor="tags-input-default">Languages</FieldLabel>
      <TagsInput
        id="tags-input-default"
        value={value}
        onValueChange={setValue}
        isDisabled={isDisabled}
        isError={isError}
        placeholder={placeholder}
      />
      <FieldDescription>Press Enter, comma or space to add one.</FieldDescription>
    </Field>
  );
};

/** The Controls panel drives this one, so `isDisabled`, `isError` and the placeholder are live. */
export const Default: Story = {
  args: {
    isDisabled: false,
    isError: false,
    placeholder: "Add a language"
  },
  render: (args) => <DefaultRender {...args} />
};

const EmptyRender = () => {
  const [value, setValue] = useState<string[]>([]);

  return (
    <Field>
      <FieldLabel htmlFor="tags-input-empty">Labels</FieldLabel>
      <TagsInput
        id="tags-input-empty"
        value={value}
        onValueChange={setValue}
        placeholder="Add a label"
      />
    </Field>
  );
};

/**
 * With no tags the control is a plain text box and the placeholder shows. It only starts
 * looking like a chip field once something has been committed.
 */
export const Empty: Story = {
  render: () => <EmptyRender />
};

const PasteRender = () => {
  const [value, setValue] = useState<string[]>([]);

  return (
    <Field>
      <FieldLabel htmlFor="tags-input-paste">Ingredients</FieldLabel>
      <TagsInput
        id="tags-input-paste"
        value={value}
        onValueChange={setValue}
        placeholder="Paste a list"
      />
    </Field>
  );
};

/**
 * A pasted list is split on commas, spaces and newlines, so a column copied out of a
 * spreadsheet and a comma separated line both arrive as separate tags.
 */
export const Paste: Story = {
  name: "Example: Paste a List",
  render: () => <PasteRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");

    await userEvent.click(input);
    await userEvent.paste("flour, sugar butter");

    await expect(canvas.getByText("flour")).toBeVisible();
    await expect(canvas.getByText("sugar")).toBeVisible();
    await expect(canvas.getByText("butter")).toBeVisible();
  }
};

const ControlledDraftRender = () => {
  const [value, setValue] = useState<string[]>(["typescript"]);
  const [draft, setDraft] = useState("go");

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="tags-input-controlled">Languages</FieldLabel>
        <TagsInput
          id="tags-input-controlled"
          value={value}
          onValueChange={setValue}
          inputValue={draft}
          onInputValueChange={setDraft}
          placeholder="Add a language"
        />
      </Field>
      <p className="text-xs text-muted">
        Uncommitted draft: <span className="font-mono">{draft || "(empty)"}</span>
      </p>
    </div>
  );
};

/**
 * Pass `inputValue` and `onInputValueChange` to own the half-typed text. The component
 * keeps its own draft otherwise, so this is only needed when something outside has to see
 * it — a form library holding it so an unconfirmed value survives a re-render, or a
 * validation message that should clear as soon as the text changes.
 */
export const ControlledDraft: Story = {
  name: "Example: Controlled Draft",
  parameters: {
    docs: {
      description: {
        story:
          "The draft starts as `go` and is mirrored below the field. Press Enter to commit it and watch the mirror clear, or keep typing to watch it track."
      }
    }
  },
  render: () => <ControlledDraftRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");

    await expect(input).toHaveValue("go");
    await userEvent.type(input, "{Enter}");
    await expect(canvas.getByText("(empty)")).toBeVisible();
  }
};

const ValidationRender = () => {
  const [value, setValue] = useState<string[]>(["api.github.com"]);
  const [error, setError] = useState<string | null>(null);

  const validateTag = (tag: string, existing: string[]) => {
    if (existing.includes(tag)) return `"${tag}" is already in the list.`;
    if (tag.includes("/")) return `"${tag}" is a host, so it can't contain a path.`;
    return null;
  };

  return (
    <Field data-invalid={error ? "true" : undefined}>
      <FieldLabel htmlFor="tags-input-validated">Hosts</FieldLabel>
      <TagsInput
        id="tags-input-validated"
        value={value}
        onValueChange={setValue}
        validateTag={validateTag}
        onValidationError={setError}
        isError={Boolean(error)}
        placeholder="api.datadoghq.com"
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
};

/**
 * `validateTag` runs before a tag is committed. Returning a reason refuses it, leaves the
 * text in the box so it can be corrected, and hands the reason to `onValidationError`.
 * `existing` never contains the value being checked, so a duplicate check is a plain
 * `includes`.
 */
export const Validation: Story = {
  name: "Example: Validation",
  parameters: {
    docs: {
      description: {
        story:
          "Hostnames are the case that needs a rule, so this one is not generic. Type a value already in the list, or one containing a `/`, then press Enter: the tag is refused and the draft is kept rather than cleared."
      }
    }
  },
  render: () => <ValidationRender />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");

    await userEvent.type(input, "api.github.com{Enter}");
    await expect(await canvas.findByText(/already in the list/)).toBeVisible();
    await expect(input).toHaveValue("api.github.com");
  }
};

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-5">
      <Field data-invalid="true">
        <FieldLabel htmlFor="tags-input-error">Languages</FieldLabel>
        <TagsInput
          id="tags-input-error"
          value={LANGUAGES}
          onValueChange={() => undefined}
          isError
        />
        <FieldError>Add at least one language.</FieldError>
      </Field>
      <Field data-disabled="true">
        <FieldLabel htmlFor="tags-input-disabled">Languages</FieldLabel>
        <TagsInput
          id="tags-input-disabled"
          value={LANGUAGES}
          onValueChange={() => undefined}
          isDisabled
        />
      </Field>
      <Field data-disabled="true">
        <FieldLabel htmlFor="tags-input-disabled-empty">Labels</FieldLabel>
        <TagsInput
          id="tags-input-disabled-empty"
          value={[]}
          onValueChange={() => undefined}
          placeholder="Add a label"
          isDisabled
        />
      </Field>
    </div>
  )
};

const OverflowRender = () => {
  const [value, setValue] = useState<string[]>([
    "typescript",
    "javascript",
    "go",
    "rust",
    "python",
    "ruby",
    "elixir",
    "kotlin",
    "swift",
    "scala",
    "haskell",
    "clojure",
    "erlang",
    "zig"
  ]);

  return (
    <Field>
      <FieldLabel htmlFor="tags-input-overflow">Languages</FieldLabel>
      <TagsInput id="tags-input-overflow" value={value} onValueChange={setValue} />
    </Field>
  );
};

/**
 * A long list wraps into a bounded, internally scrollable area so the form cannot grow
 * without limit, with a fade at whichever edge has more to show.
 */
export const Overflow: Story = {
  name: "Example: Many Tags",
  render: () => <OverflowRender />
};
