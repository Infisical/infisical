import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudIcon, KeyIcon, LockIcon, ServerIcon, ShieldIcon } from "lucide-react";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "../Field";
import { Input } from "../Input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "./Select";

/**
 * `Select` is the v3 single-select dropdown built on `@radix-ui/react-select`. It
 * is a compound component — you assemble it from `Select` (root) →
 * `SelectTrigger` (the clickable surface, contains a `SelectValue`) →
 * `SelectContent` (the portalled menu) → `SelectItem`s, optionally grouped with
 * `SelectGroup` + `SelectLabel` and divided with `SelectSeparator`.
 *
 * The trigger sizes to its content by default — let the parent container
 * (`Field`, a sidebar, a toolbar) decide width via layout constraints. For
 * labels, helper text, and validation errors, compose with `Field` /
 * `FieldLabel` / `FieldDescription` / `FieldError` from `../Field` exactly as
 * you would for `Input` — the `id` belongs on the **trigger**, not the root.
 *
 * Reach for `Select` when the option list is short and known. For long, search-
 * driven lists (commands, secrets, identities) use `Command` instead. For
 * multi-select, layer `Command` inside a `Popover` — `Select` is single-value
 * by design.
 */
const meta = {
  title: "Generic/Select",
  component: Select,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean"
    },
    defaultValue: {
      control: "text"
    },
    value: {
      control: "text"
    },
    dir: {
      control: "select",
      options: ["ltr", "rtl"]
    },
    children: {
      table: { disable: true }
    }
  },
  args: {
    disabled: false
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
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The baseline anatomy: `Select` wraps a `SelectTrigger` (with a `SelectValue` for the placeholder / selected text) and a `SelectContent` containing flat `SelectItem`s. The trigger sizes to its content by default — let a `Field` or other layout container decide its width when you need it to stretch."
      }
    }
  },
  render: () => (
    <Select>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose an environment" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="dev">Development</SelectItem>
        <SelectItem value="staging">Staging</SelectItem>
        <SelectItem value="qa">QA</SelectItem>
        <SelectItem value="prod">Production</SelectItem>
        <SelectItem value="dr">Disaster recovery</SelectItem>
      </SelectContent>
    </Select>
  )
};

export const SizeSmall: Story = {
  name: "Size: Small",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `size="sm"` to `SelectTrigger` for the compact variant — appropriate for table cells, toolbars, and filter rows where vertical density matters. The default size is what you want inside a `Field`, where the trigger needs to line up with `Input`s and other form controls.'
      }
    }
  },
  render: () => (
    <Select defaultValue="prod">
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="dev">Development</SelectItem>
        <SelectItem value="staging">Staging</SelectItem>
        <SelectItem value="prod">Production</SelectItem>
      </SelectContent>
    </Select>
  )
};

export const Disabled: Story = {
  name: "State: Disabled",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `disabled` to the root `Select` to block opening the menu entirely — the trigger dims and signals non-interactivity through the cursor. Use this when the field is contextually unavailable (no entitlement, dependent on another field, locked by policy)."
      }
    }
  },
  render: () => (
    <Select disabled defaultValue="prod">
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="dev">Development</SelectItem>
        <SelectItem value="prod">Production</SelectItem>
      </SelectContent>
    </Select>
  )
};

export const DisabledItem: Story = {
  name: "State: Disabled Item",
  parameters: {
    docs: {
      description: {
        story:
          "Disable individual options with `disabled` on `SelectItem` — the row dims and is skipped by both pointer and keyboard navigation. Use for rows that exist for context but aren't currently selectable (entitlement-gated tiers, conflicting choices, items already in use)."
      }
    }
  },
  render: () => (
    <Select>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Pick a plan" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="free">Free</SelectItem>
        <SelectItem value="pro">Pro</SelectItem>
        <SelectItem value="enterprise" disabled>
          Enterprise (contact sales)
        </SelectItem>
      </SelectContent>
    </Select>
  )
};

export const Error: Story = {
  name: "State: Error",
  parameters: {
    docs: {
      description: {
        story:
          'Setting `isError` on `SelectTrigger` flips `aria-invalid="true"`, which (a) styles the trigger with the danger border + ring and (b) lets assistive tech announce the error. Always render a paired `FieldError` so sighted users get the explanation too — see *Example: With Validation Error*.'
      }
    }
  },
  render: () => (
    <Select>
      <SelectTrigger isError className="w-full">
        <SelectValue placeholder="Choose an environment" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="dev">Development</SelectItem>
        <SelectItem value="prod">Production</SelectItem>
      </SelectContent>
    </Select>
  )
};

export const WithLabel: Story = {
  name: "Example: With Label",
  parameters: {
    docs: {
      description: {
        story:
          "The minimum accessible pairing: a `Field` wrapper, a `FieldLabel` whose `htmlFor` matches the `id` on the **`SelectTrigger`** (not the root `Select`), and the trigger itself. Clicking the label focuses and opens the menu."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="select-with-label">Environment</FieldLabel>
      <Select>
        <SelectTrigger id="select-with-label" className="w-full">
          <SelectValue placeholder="Choose an environment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dev">Development</SelectItem>
          <SelectItem value="staging">Staging</SelectItem>
          <SelectItem value="prod">Production</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
};

export const WithDescription: Story = {
  name: "Example: With Description",
  parameters: {
    docs: {
      description: {
        story:
          "Add a `FieldDescription` below the trigger for helper text — the *why* behind the field, format hints, or cross-references. Keep it short; long-form guidance belongs in docs, not the form."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="select-with-description">Default region</FieldLabel>
      <Select>
        <SelectTrigger id="select-with-description" className="w-full">
          <SelectValue placeholder="Choose a region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="us-east-1">us-east-1 (N. Virginia)</SelectItem>
          <SelectItem value="us-west-2">us-west-2 (Oregon)</SelectItem>
          <SelectItem value="eu-west-1">eu-west-1 (Ireland)</SelectItem>
          <SelectItem value="ap-south-1">ap-south-1 (Mumbai)</SelectItem>
        </SelectContent>
      </Select>
      <FieldDescription>
        New projects in this org will deploy here unless overridden at create time.
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
          "The standard validation pattern: `isError` on the trigger + a `FieldError` below it. `FieldError` accepts a string (shown here) or a `react-hook-form` `errors` array — duplicate messages are de-duplicated and multiple distinct messages render as a bulleted list."
      }
    }
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="select-with-error">Environment</FieldLabel>
      <Select>
        <SelectTrigger id="select-with-error" isError className="w-full">
          <SelectValue placeholder="Choose an environment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dev">Development</SelectItem>
          <SelectItem value="prod">Production</SelectItem>
        </SelectContent>
      </Select>
      <FieldError>Environment is required.</FieldError>
    </Field>
  )
};

export const WithGroups: Story = {
  name: "Example: With Groups",
  parameters: {
    docs: {
      description: {
        story:
          "Use `SelectGroup` to bucket related items, `SelectLabel` for the group heading (small muted text, non-interactive), and `SelectSeparator` for a thin divider between groups. The grouping is purely visual — `value`s still need to be unique across the whole menu."
      }
    }
  },
  render: () => (
    <Select>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose an environment" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Non-production</SelectLabel>
          <SelectItem value="dev">Development</SelectItem>
          <SelectItem value="staging">Staging</SelectItem>
          <SelectItem value="qa">QA</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Production</SelectLabel>
          <SelectItem value="prod">Production</SelectItem>
          <SelectItem value="dr">Disaster recovery</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
};

export const WithIcons: Story = {
  name: "Example: With Icons",
  parameters: {
    docs: {
      description: {
        story:
          "`SelectItem` happily renders a leading icon — bare SVGs are auto-sized and stay out of the click target. The check indicator that marks the selected row sits on the right, so leading icons never collide with it. The `SelectValue` mirrors whatever the selected item rendered, so the chosen icon shows in the trigger too."
      }
    }
  },
  render: () => (
    <Select defaultValue="kms">
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="secrets">
          <KeyIcon />
          Secret Manager
        </SelectItem>
        <SelectItem value="kms">
          <LockIcon />
          KMS
        </SelectItem>
        <SelectItem value="pki">
          <ShieldIcon />
          PKI
        </SelectItem>
        <SelectItem value="ssh">
          <ServerIcon />
          SSH
        </SelectItem>
      </SelectContent>
    </Select>
  )
};

export const InFieldGroup: Story = {
  name: "Example: In Field Group",
  parameters: {
    docs: {
      description: {
        story:
          "Stack `Select`s alongside other inputs in a `FieldGroup` for consistent vertical rhythm. This is the canonical layout for almost every form in the product — `Select`, `Input`, and `TextArea` all line up to the same width inside their `Field`s."
      }
    }
  },
  render: () => (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="group-name">Project name</FieldLabel>
        <Input id="group-name" defaultValue="acme-prod" />
      </Field>
      <Field>
        <FieldLabel htmlFor="group-environment">Default environment</FieldLabel>
        <Select defaultValue="dev">
          <SelectTrigger id="group-environment" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dev">Development</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="prod">Production</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>Used as the active environment when the project loads.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="group-region">Region</FieldLabel>
        <Select defaultValue="us-east-1">
          <SelectTrigger id="group-region" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="us-east-1">us-east-1</SelectItem>
            <SelectItem value="us-west-2">us-west-2</SelectItem>
            <SelectItem value="eu-west-1">eu-west-1</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
};

function ControlledRender() {
  const [value, setValue] = useState("staging");
  return (
    <Field>
      <FieldLabel htmlFor="select-controlled">Environment</FieldLabel>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id="select-controlled" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dev">Development</SelectItem>
          <SelectItem value="staging">Staging</SelectItem>
          <SelectItem value="prod">Production</SelectItem>
        </SelectContent>
      </Select>
      <FieldDescription>
        Selected: <code>{value}</code>
      </FieldDescription>
    </Field>
  );
}

export const Controlled: Story = {
  name: "Example: Controlled",
  parameters: {
    docs: {
      description: {
        story:
          "Drive the value with `value` + `onValueChange` when you need to react to changes (form libraries, derived UI, telemetry). Use `defaultValue` instead when you only need an initial value and don't care about the selection until submit — every other story above is uncontrolled for that reason."
      }
    }
  },
  render: () => <ControlledRender />
};

export const LongList: Story = {
  name: "Example: Long List",
  parameters: {
    docs: {
      description: {
        story:
          "When the menu overflows the viewport, `SelectContent` automatically renders `SelectScrollUpButton` / `SelectScrollDownButton` chevrons — you don't wire them up. The menu is also portalled, so it escapes any `overflow:hidden` ancestor. For lists this long, consider whether `Command` (searchable) is a better fit."
      }
    }
  },
  render: () => (
    <Select>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose an AWS region" />
      </SelectTrigger>
      <SelectContent>
        {[
          "us-east-1",
          "us-east-2",
          "us-west-1",
          "us-west-2",
          "ca-central-1",
          "sa-east-1",
          "eu-west-1",
          "eu-west-2",
          "eu-west-3",
          "eu-central-1",
          "eu-north-1",
          "eu-south-1",
          "me-south-1",
          "af-south-1",
          "ap-south-1",
          "ap-northeast-1",
          "ap-northeast-2",
          "ap-northeast-3",
          "ap-southeast-1",
          "ap-southeast-2",
          "ap-east-1"
        ].map((region) => (
          <SelectItem key={region} value={region}>
            <CloudIcon />
            {region}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
};
