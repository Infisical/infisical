import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field, FieldDescription, FieldError, FieldLabel } from "../Field";
import { CreatableSelect } from "./CreatableSelect";

type Option = { label: string; value: string };

const TAG_OPTIONS: Option[] = [
  { label: "production", value: "production" },
  { label: "staging", value: "staging" },
  { label: "rotation-required", value: "rotation-required" },
  { label: "compliance", value: "compliance" },
  { label: "audit", value: "audit" }
];

const slugRegex = /^[a-z][a-z0-9-]*$/;

/**
 * `CreatableSelect` is the v3 react-select-based dropdown that lets users pick
 * from existing options *or* create new ones inline. The canonical use is a
 * tag input — choose existing tags from the menu, type a new one and hit Enter
 * to create it.
 *
 * Inherits `FilterableSelect`'s state and styling, plus react-select-creatable's
 * extras for managing inline creation:
 * - **`onCreateOption(input)`** — called when the user creates a new value.
 *   Persist it (e.g. via a mutation), then add it to the option list.
 * - **`isValidNewOption(input)`** — gate creation on a validator (slug shape,
 *   length, uniqueness). Return `false` to hide the Create suggestion.
 * - **`formatCreateLabel(input)`** — customize the suggestion text.
 *
 * Reach for `CreatableSelect` over `FilterableSelect` only when the user
 * legitimately needs to add new entries (tags, role names, custom claims).
 * For a fixed list, `FilterableSelect` is the right primitive.
 */
const meta = {
  title: "Generic/CreatableSelect",
  component: CreatableSelect,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="h-52 w-96">
        <Story />
      </div>
    )
  ],
  globals: {
    backgrounds: { value: "card" }
  }
} satisfies Meta<typeof CreatableSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function DefaultRender() {
  const [options, setOptions] = useState<Option[]>(TAG_OPTIONS);
  const [value, setValue] = useState<Option | null>(null);
  return (
    <CreatableSelect
      value={value}
      onChange={(next) => setValue(next as Option | null)}
      options={options}
      onCreateOption={(input) => {
        const next = { label: input, value: input };
        setOptions([...options, next]);
        setValue(next);
      }}
      placeholder="Pick or create a tag..."
    />
  );
}

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline creatable single-select. Type a value not in the list and the menu offers a Create suggestion; selecting it triggers `onCreateOption(input)` so the parent can persist the new value and append it to the option list."
      }
    }
  },
  render: () => <DefaultRender />
};

function MultiRender() {
  const [options, setOptions] = useState<Option[]>(TAG_OPTIONS);
  const [value, setValue] = useState<Option[]>([]);
  return (
    <CreatableSelect
      isMulti
      value={value}
      onChange={(next) => setValue([...((next ?? []) as Option[])])}
      options={options}
      onCreateOption={(input) => {
        const next = { label: input, value: input };
        setOptions([...options, next]);
        setValue([...value, next]);
      }}
      placeholder="Pick or create tags..."
    />
  );
}

export const Multi: Story = {
  name: "Variant: Multi",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isMulti` for the canonical tag-input experience — pick existing tags from the menu, type a new one and hit Enter to create it. Each selection renders as a removable chip; created entries persist in the option list so the next user sees them."
      }
    }
  },
  render: () => <MultiRender />
};

export const Disabled: Story = {
  name: "State: Disabled",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isDisabled` to block opening the menu and creating new entries. Use when the field is contextually locked (no permission to edit tags, locked by policy)."
      }
    }
  },
  render: () => (
    <CreatableSelect
      isDisabled
      isMulti
      defaultValue={[TAG_OPTIONS[0], TAG_OPTIONS[3]]}
      options={TAG_OPTIONS}
    />
  )
};

export const WithError: Story = {
  name: "State: Error",
  parameters: {
    docs: {
      description: {
        story:
          "Setting `isError` paints the danger border + ring and announces the error to assistive tech, matching `Input`'s error contract. Always pair with a `FieldError` so sighted users get the explanation — see *Example: With Validation Error*."
      }
    }
  },
  render: () => (
    <CreatableSelect isError isMulti options={TAG_OPTIONS} placeholder="Pick or create tags..." />
  )
};

function WithValidationErrorRender() {
  const [value, setValue] = useState<Option[]>([]);
  const isInvalid = value.length === 0;
  return (
    <Field>
      <FieldLabel htmlFor="creatable-error">Tags</FieldLabel>
      <CreatableSelect
        inputId="creatable-error"
        isMulti
        value={value}
        onChange={(next) => setValue([...((next ?? []) as Option[])])}
        options={TAG_OPTIONS}
        isError={isInvalid}
        placeholder="Pick or create tags..."
      />
      {isInvalid && <FieldError>Add at least one tag.</FieldError>}
    </Field>
  );
}

export const WithValidationError: Story = {
  name: "Example: With Validation Error",
  parameters: {
    docs: {
      description: {
        story:
          "The standard validation pattern: `isError` on the control + a `FieldError` below it. The error clears as soon as the user picks (or creates) a value."
      }
    }
  },
  render: () => <WithValidationErrorRender />
};

function ValidatedCreationRender() {
  const [options, setOptions] = useState<Option[]>(TAG_OPTIONS);
  const [value, setValue] = useState<Option[]>([]);
  return (
    <Field>
      <FieldLabel htmlFor="creatable-tags">Tags</FieldLabel>
      <CreatableSelect
        inputId="creatable-tags"
        isMulti
        value={value}
        onChange={(next) => setValue([...((next ?? []) as Option[])])}
        options={options}
        isValidNewOption={(input) =>
          slugRegex.test(input) && !options.some((o) => o.value === input)
        }
        formatCreateLabel={(input) => `Create tag "${input}"`}
        noOptionsMessage={({ inputValue }) =>
          inputValue ? "Tags must be lowercase slugs (a–z, 0–9, hyphen)" : "No tags yet"
        }
        onCreateOption={(input) => {
          const next = { label: input, value: input };
          setOptions([...options, next]);
          setValue([...value, next]);
        }}
        placeholder="Pick or create tags..."
      />
      <FieldDescription>
        Tag slugs must start with a letter and contain only lowercase letters, numbers, and hyphens.
      </FieldDescription>
    </Field>
  );
}

export const ValidatedCreation: Story = {
  name: "Example: Validated Creation",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isValidNewOption` to gate inline creation — return `false` to hide the Create suggestion until the user types a valid value. Pair with `noOptionsMessage` to explain *why* the input is rejected, and `formatCreateLabel` to customize the suggestion text. This is the canonical secret-tag input from the secret-manager UI."
      }
    }
  },
  render: () => <ValidatedCreationRender />
};
