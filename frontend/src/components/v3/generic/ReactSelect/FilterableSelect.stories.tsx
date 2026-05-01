import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field, FieldDescription, FieldError, FieldLabel } from "../Field";
import { FilterableSelect } from "./FilterableSelect";

type Option = { label: string; value: string };
type RegionOption = Option & { region: string };

const ENVIRONMENT_OPTIONS: Option[] = [
  { label: "Development", value: "dev" },
  { label: "Staging", value: "staging" },
  { label: "QA", value: "qa" },
  { label: "Production", value: "prod" },
  { label: "Disaster Recovery", value: "dr" }
];

const REGION_OPTIONS: RegionOption[] = [
  { label: "us-east-1 (N. Virginia)", value: "us-east-1", region: "Americas" },
  { label: "us-west-2 (Oregon)", value: "us-west-2", region: "Americas" },
  { label: "ca-central-1 (Montréal)", value: "ca-central-1", region: "Americas" },
  { label: "eu-west-1 (Ireland)", value: "eu-west-1", region: "Europe" },
  { label: "eu-central-1 (Frankfurt)", value: "eu-central-1", region: "Europe" },
  { label: "ap-south-1 (Mumbai)", value: "ap-south-1", region: "Asia Pacific" },
  { label: "ap-southeast-1 (Singapore)", value: "ap-southeast-1", region: "Asia Pacific" }
];

/**
 * `FilterableSelect` is the v3 react-select-based dropdown for searchable
 * single or multi selection over a known set of options. Reach for it when the
 * option list is too long for the Radix-based `Select` (which has no search)
 * but doesn't need users to add new entries — for that, see `CreatableSelect`.
 *
 * Pass options as `{ label, value }[]`. Use `isMulti` for multi-select; pass
 * `groupBy` (a key on each option) and optionally `getGroupHeaderLabel` to
 * bucket options into headed groups.
 *
 * Errors flip via the `isError` prop, matching `Input` and `Select`. For
 * labels and helper text, compose with `Field` / `FieldLabel` /
 * `FieldDescription` / `FieldError` — same pattern as the rest of the v3 form
 * primitives.
 */
const meta = {
  title: "Generic/FilterableSelect",
  component: FilterableSelect,
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
} satisfies Meta<typeof FilterableSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline single-select with a searchable list. Type in the field to filter options; click or hit Enter to select. Reach for this over the Radix-based `Select` whenever the option list is long enough that a user would want search."
      }
    }
  },
  render: () => (
    <FilterableSelect options={ENVIRONMENT_OPTIONS} placeholder="Choose an environment..." />
  )
};

export const Multi: Story = {
  name: "Variant: Multi",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isMulti` to allow selecting multiple options. The chosen values render as removable chips inside the control; `closeMenuOnSelect` defaults to `false` in this mode so the user can pick several without re-opening the menu."
      }
    }
  },
  render: () => (
    <FilterableSelect isMulti options={ENVIRONMENT_OPTIONS} placeholder="Choose environments..." />
  )
};

export const Disabled: Story = {
  name: "State: Disabled",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isDisabled` to block opening the menu and dim the control. Use when the field is contextually unavailable (no entitlement, dependent on another field, locked by policy)."
      }
    }
  },
  render: () => (
    <FilterableSelect
      isDisabled
      defaultValue={ENVIRONMENT_OPTIONS[3]}
      options={ENVIRONMENT_OPTIONS}
    />
  )
};

export const Loading: Story = {
  name: "State: Loading",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isLoading` while the option list is fetching. The control still opens but shows a loading indicator instead of options. Useful for selects whose options come from an async query."
      }
    }
  },
  render: () => <FilterableSelect isLoading options={[]} placeholder="Loading regions..." />
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
    <FilterableSelect
      isError
      options={ENVIRONMENT_OPTIONS}
      placeholder="Choose an environment..."
    />
  )
};

export const Grouped: Story = {
  name: "Example: Grouped",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `groupBy` (a key on each option) and the dropdown buckets options under that key's value. Optionally pass `getGroupHeaderLabel` to format the heading text. The grouping is purely visual — values must still be unique across the whole menu."
      }
    }
  },
  render: () => (
    <FilterableSelect options={REGION_OPTIONS} groupBy="region" placeholder="Choose a region..." />
  )
};

export const WithLabel: Story = {
  name: "Example: With Label",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap in a `Field` with `FieldLabel` for the minimum accessible pairing. Pass `inputId` so the label points at the inner input — clicking the label focuses the search box rather than opening the menu."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="filterable-region">Default region</FieldLabel>
      <FilterableSelect
        inputId="filterable-region"
        options={REGION_OPTIONS}
        placeholder="Choose a region..."
      />
      <FieldDescription>
        New projects in this org will deploy here unless overridden at create time.
      </FieldDescription>
    </Field>
  )
};

function WithValidationErrorRender() {
  const [value, setValue] = useState<Option | null>(null);
  const isInvalid = !value;
  return (
    <Field>
      <FieldLabel htmlFor="filterable-error">Environment</FieldLabel>
      <FilterableSelect
        inputId="filterable-error"
        value={value}
        onChange={(next) => setValue(next as Option | null)}
        options={ENVIRONMENT_OPTIONS}
        isError={isInvalid}
        placeholder="Choose an environment..."
      />
      {isInvalid && <FieldError>Environment is required.</FieldError>}
    </Field>
  );
}

export const WithValidationError: Story = {
  name: "Example: With Validation Error",
  parameters: {
    docs: {
      description: {
        story:
          "The standard validation pattern: `isError` on the control + a `FieldError` below it. The error clears as soon as the user picks a value."
      }
    }
  },
  render: () => <WithValidationErrorRender />
};
