import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle
} from "../Field";
import { Label } from "../Label";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";

/**
 * `RadioGroup` is the v3 single-choice control built on
 * `@radix-ui/react-radio-group`. Compose `RadioGroup` (root) with one or more
 * `RadioGroupItem`s — each item gets a `value` and is paired with a visible
 * `Label` (or `FieldTitle` / `FieldDescription` inside a horizontal `Field`
 * for richer rows).
 *
 * The root manages the selected `value` (controlled or uncontrolled via
 * `defaultValue`); the items are stateless dots that paint as filled when
 * their `value` matches the group's. Errors flip via the `isError` prop on
 * each item, matching `Input` and `Checkbox`.
 *
 * Reach for `RadioGroup` for short, mutually-exclusive choices that benefit
 * from showing every option at once. For long lists, use `Select` (or
 * `FilterableSelect` once the list gets searchable). For multi-select,
 * `Checkbox` rows in a `FieldSet`.
 */
const meta = {
  title: "Generic/RadioGroup",
  component: RadioGroup,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
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
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Baseline group of three options. Each `RadioGroupItem` is paired with a `Label` whose `htmlFor` matches the item's `id`, so clicking the label selects the option."
      }
    }
  },
  render: () => (
    <RadioGroup defaultValue="staging">
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-default-dev" value="dev" />
        <Label htmlFor="rg-default-dev">Development</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-default-staging" value="staging" />
        <Label htmlFor="rg-default-staging">Staging</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-default-prod" value="prod" />
        <Label htmlFor="rg-default-prod">Production</Label>
      </div>
    </RadioGroup>
  )
};

export const Disabled: Story = {
  name: "State: Disabled",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `disabled` to the root `RadioGroup` to dim and lock every option at once. Use when the field is contextually unavailable (no entitlement, dependent on another field, locked by policy)."
      }
    }
  },
  render: () => (
    <RadioGroup defaultValue="prod" disabled>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-disabled-dev" value="dev" />
        <Label htmlFor="rg-disabled-dev">Development</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-disabled-staging" value="staging" />
        <Label htmlFor="rg-disabled-staging">Staging</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-disabled-prod" value="prod" />
        <Label htmlFor="rg-disabled-prod">Production</Label>
      </div>
    </RadioGroup>
  )
};

export const DisabledItem: Story = {
  name: "State: Disabled Item",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `disabled` to a single `RadioGroupItem` to disable just that option — the item dims and is skipped by both pointer and keyboard navigation. Use for options that exist for context but aren't currently selectable (entitlement-gated tiers, conflicting choices)."
      }
    }
  },
  render: () => (
    <RadioGroup defaultValue="basic">
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-item-disabled-basic" value="basic" />
        <Label htmlFor="rg-item-disabled-basic">Free</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-item-disabled-pro" value="pro" />
        <Label htmlFor="rg-item-disabled-pro">Pro</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-item-disabled-enterprise" value="enterprise" disabled />
        <Label htmlFor="rg-item-disabled-enterprise">Enterprise (contact sales)</Label>
      </div>
    </RadioGroup>
  )
};

export const WithError: Story = {
  name: "State: Error",
  parameters: {
    docs: {
      description: {
        story:
          'Setting `isError` on `RadioGroupItem` flips `aria-invalid="true"`, which paints the danger border on the item — same contract as `Input` and `Checkbox`. Always pair with a `FieldError` so sighted users get the explanation — see *Example: With Validation Error*.'
      }
    }
  },
  render: () => (
    <RadioGroup>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-error-dev" value="dev" isError />
        <Label htmlFor="rg-error-dev">Development</Label>
      </div>
      <div className="flex items-center gap-3">
        <RadioGroupItem id="rg-error-prod" value="prod" isError />
        <Label htmlFor="rg-error-prod">Production</Label>
      </div>
    </RadioGroup>
  )
};

export const WithLabel: Story = {
  name: "Example: With Label",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap the group in a `Field` with a `FieldLabel` so the question itself is labelled, and pair each `RadioGroupItem` with its own `Label`. The `FieldLabel` describes the field as a whole; the per-item `Label` is the visible option text."
      }
    }
  },
  render: () => (
    <Field className="w-80">
      <FieldLabel>Default environment</FieldLabel>
      <RadioGroup defaultValue="dev">
        <div className="flex items-center gap-3">
          <RadioGroupItem id="rg-label-dev" value="dev" />
          <Label htmlFor="rg-label-dev">Development</Label>
        </div>
        <div className="flex items-center gap-3">
          <RadioGroupItem id="rg-label-staging" value="staging" />
          <Label htmlFor="rg-label-staging">Staging</Label>
        </div>
        <div className="flex items-center gap-3">
          <RadioGroupItem id="rg-label-prod" value="prod" />
          <Label htmlFor="rg-label-prod">Production</Label>
        </div>
      </RadioGroup>
    </Field>
  )
};

export const WithItemDescriptions: Story = {
  name: "Example: With Item Descriptions",
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          "For richer rows, pair each `RadioGroupItem` with `FieldTitle` + `FieldDescription` inside a horizontal `Field`. The whole row reads as one option — title and helper text on the right of the radio dot."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel>Sync strategy</FieldLabel>
      <RadioGroup defaultValue="manual">
        <Field orientation="horizontal">
          <RadioGroupItem id="rg-sync-manual" value="manual" />
          <FieldContent>
            <FieldTitle>Manual</FieldTitle>
            <FieldDescription>
              Run a sync only when you click the button. Lowest cost; no surprise overwrites.
            </FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem id="rg-sync-scheduled" value="scheduled" />
          <FieldContent>
            <FieldTitle>Scheduled</FieldTitle>
            <FieldDescription>
              Sync on a cron expression. Good for nightly snapshots and weekend rotations.
            </FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem id="rg-sync-realtime" value="realtime" />
          <FieldContent>
            <FieldTitle>Real-time</FieldTitle>
            <FieldDescription>
              Stream every change to the destination. Highest cost; requires upstream webhooks.
            </FieldDescription>
          </FieldContent>
        </Field>
      </RadioGroup>
    </Field>
  )
};

export const ChoiceCards: Story = {
  name: "Example: Choice Cards",
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Wrap each option in a `FieldLabel` so the whole row — title, description, and radio dot — becomes a single click target via the native `<label>` association. Reach for this layout when each option needs more than a one-word label (pricing tiers, integration modes, role choices)."
      }
    }
  },
  render: () => (
    <RadioGroup defaultValue="plus">
      <FieldLabel htmlFor="rg-card-plus">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Plus</FieldTitle>
            <FieldDescription>For individuals and small teams.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="plus" id="rg-card-plus" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-pro">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Pro</FieldTitle>
            <FieldDescription>For growing businesses.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="pro" id="rg-card-pro" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-enterprise">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Enterprise</FieldTitle>
            <FieldDescription>For large teams and enterprises.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="enterprise" id="rg-card-enterprise" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  )
};

export const ChoiceCardsProject: Story = {
  name: "Example: Choice Cards (Project)",
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Pass `variant="project"` to `FieldLabel` so the selected card paints with the project scope tokens. Reach for this in project-scoped pickers (project roles, environment defaults, project-level integrations).'
      }
    }
  },
  render: () => (
    <RadioGroup defaultValue="member">
      <FieldLabel htmlFor="rg-card-proj-viewer" variant="project">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Viewer</FieldTitle>
            <FieldDescription>Read-only access to secrets and audit logs.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="viewer" id="rg-card-proj-viewer" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-proj-member" variant="project">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Member</FieldTitle>
            <FieldDescription>Read and write access; cannot manage members.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="member" id="rg-card-proj-member" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-proj-admin" variant="project">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Admin</FieldTitle>
            <FieldDescription>Full access including member and policy management.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="admin" id="rg-card-proj-admin" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  )
};

export const ChoiceCardsOrg: Story = {
  name: "Example: Choice Cards (Org)",
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Pass `variant="org"` to `FieldLabel` so the selected card paints with the organization scope tokens. Reach for this in org-level pickers (billing tier, default org settings, SSO mode).'
      }
    }
  },
  render: () => (
    <RadioGroup defaultValue="pro">
      <FieldLabel htmlFor="rg-card-org-plus" variant="org">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Plus</FieldTitle>
            <FieldDescription>For individuals and small teams.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="plus" id="rg-card-org-plus" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-org-pro" variant="org">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Pro</FieldTitle>
            <FieldDescription>For growing businesses with multiple projects.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="pro" id="rg-card-org-pro" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-org-enterprise" variant="org">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Enterprise</FieldTitle>
            <FieldDescription>
              For large teams and enterprises with custom compliance needs.
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem value="enterprise" id="rg-card-org-enterprise" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  )
};

export const ChoiceCardsSubOrg: Story = {
  name: "Example: Choice Cards (Sub-Org)",
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    )
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Pass `variant="sub-org"` to `FieldLabel` so the selected card paints with the sub-organization scope tokens. Reach for this in sub-org / namespace pickers and any choice that lives below the org but above project scope.'
      }
    }
  },
  render: () => (
    <RadioGroup defaultValue="engineering">
      <FieldLabel htmlFor="rg-card-suborg-engineering" variant="sub-org">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Engineering</FieldTitle>
            <FieldDescription>Production secrets shared across app teams.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="engineering" id="rg-card-suborg-engineering" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-suborg-data" variant="sub-org">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Data</FieldTitle>
            <FieldDescription>ETL credentials and warehouse access.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="data" id="rg-card-suborg-data" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="rg-card-suborg-platform" variant="sub-org">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Platform</FieldTitle>
            <FieldDescription>Infrastructure tooling and CI/CD secrets.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="platform" id="rg-card-suborg-platform" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  )
};

function WithValidationErrorRender() {
  const [value, setValue] = useState<string>("");
  const isInvalid = !value;
  return (
    <Field className="w-80">
      <FieldLabel>Default environment</FieldLabel>
      <RadioGroup value={value} onValueChange={setValue}>
        <div className="flex items-center gap-3">
          <RadioGroupItem id="rg-validation-dev" value="dev" isError={isInvalid} />
          <Label htmlFor="rg-validation-dev">Development</Label>
        </div>
        <div className="flex items-center gap-3">
          <RadioGroupItem id="rg-validation-staging" value="staging" isError={isInvalid} />
          <Label htmlFor="rg-validation-staging">Staging</Label>
        </div>
        <div className="flex items-center gap-3">
          <RadioGroupItem id="rg-validation-prod" value="prod" isError={isInvalid} />
          <Label htmlFor="rg-validation-prod">Production</Label>
        </div>
      </RadioGroup>
      {isInvalid && <FieldError>Pick a default environment.</FieldError>}
    </Field>
  );
}

export const WithValidationError: Story = {
  name: "Example: With Validation Error",
  parameters: {
    docs: {
      description: {
        story:
          "The standard validation pattern: `isError` on each `RadioGroupItem` + a `FieldError` below the group. Wire the error state to your validator (here, just 'pick something') — the error clears as soon as the user makes a selection."
      }
    }
  },
  render: () => <WithValidationErrorRender />
};
