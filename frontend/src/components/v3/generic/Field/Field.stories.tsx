import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "../Checkbox";
import { Input } from "../Input";
import { Switch } from "../Switch";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
} from "./Field";

/**
 * Field provides the layout primitives for building form controls — label, control,
 * description, and error message — with consistent spacing and accessible markup.
 * Compose a single input with `Field` + `FieldLabel` + a control + optional
 * `FieldDescription` / `FieldError`. Stack multiple fields in a `FieldGroup`, or wrap
 * legal groupings (checkbox sets, fieldsets) in a `FieldSet` with a `FieldLegend`.
 *
 * The `orientation` prop on `Field` switches between `vertical` (default — stacked),
 * `horizontal` (label left, control right), and `responsive` (vertical on narrow
 * containers, horizontal on wider ones).
 */
const meta = {
  title: "Generic/Field",
  component: Field,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["vertical", "horizontal", "responsive"]
    },
    children: {
      table: {
        disable: true
      }
    },
    className: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline field — `FieldLabel`, a control, and an optional `FieldDescription`. The label's `htmlFor` points at the control's `id` so screen readers pair them correctly."
      }
    }
  },
  render: () => (
    <Field className="w-96">
      <FieldLabel htmlFor="field-email">Email</FieldLabel>
      <Input id="field-email" type="email" placeholder="you@company.com" />
      <FieldDescription>
        We&apos;ll use this address for sign-in and notifications.
      </FieldDescription>
    </Field>
  )
};

export const WithError: Story = {
  name: "Example: With Error",
  parameters: {
    docs: {
      description: {
        story:
          "Render `FieldError` below the control when validation fails. It accepts either a plain string (via `children`) or an `errors` array from `react-hook-form` — duplicate messages are deduplicated; multiple distinct messages render as a bulleted list."
      }
    }
  },
  render: () => (
    <Field className="w-96">
      <FieldLabel htmlFor="field-email-error">Email</FieldLabel>
      <Input id="field-email-error" type="email" defaultValue="not-an-email" isError aria-invalid />
      <FieldError>Enter a valid email address.</FieldError>
    </Field>
  )
};

export const Horizontal: Story = {
  name: "Example: Horizontal",
  parameters: {
    docs: {
      description: {
        story:
          'Pass `orientation="horizontal"` for label-left / control-right layouts — common for inline toggle rows in settings panels. Wrap the label + description in a `FieldContent` so both align correctly against the control.'
      }
    }
  },
  render: () => (
    <Field orientation="horizontal" className="w-[420px]">
      <FieldContent>
        <FieldTitle>Multi-factor authentication</FieldTitle>
        <FieldDescription>
          Require a second factor when signing in from a new device.
        </FieldDescription>
      </FieldContent>
      <Switch defaultChecked />
    </Field>
  )
};

export const FieldGroupExample: Story = {
  name: "Example: Field Group",
  parameters: {
    docs: {
      description: {
        story:
          "Stack related fields in a `FieldGroup` for consistent vertical rhythm (`gap-5`). The group also provides the `@container` query context that the `responsive` orientation keys off of."
      }
    }
  },
  render: () => (
    <FieldGroup className="w-96">
      <Field>
        <FieldLabel htmlFor="group-name">Name</FieldLabel>
        <Input id="group-name" defaultValue="Scott Wilson" />
      </Field>
      <Field>
        <FieldLabel htmlFor="group-email">Email</FieldLabel>
        <Input id="group-email" type="email" defaultValue="scott@infisical.com" />
        <FieldDescription>
          Used for sign-in and critical notifications. Cannot be changed.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="group-role">Role</FieldLabel>
        <Input id="group-role" defaultValue="Admin" disabled />
      </Field>
    </FieldGroup>
  )
};

export const WithSeparator: Story = {
  name: "Example: With Separator",
  parameters: {
    docs: {
      description: {
        story:
          'Use `FieldSeparator` with text children ("OR") to split a form into alternate paths — e.g. email/password login above and SSO below.'
      }
    }
  },
  render: () => (
    <FieldGroup className="w-96">
      <Field>
        <FieldLabel htmlFor="separator-email">Email</FieldLabel>
        <Input id="separator-email" type="email" placeholder="you@company.com" />
      </Field>
      <Field>
        <FieldLabel htmlFor="separator-password">Password</FieldLabel>
        <Input id="separator-password" type="password" placeholder="••••••••" />
      </Field>
      <FieldSeparator>OR</FieldSeparator>
      <Field>
        <FieldLabel htmlFor="separator-sso">Company domain</FieldLabel>
        <Input id="separator-sso" placeholder="acme.com" />
        <FieldDescription>
          Enter your organization&apos;s domain to sign in with SSO.
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
};

export const FieldSetExample: Story = {
  name: "Example: Field Set",
  parameters: {
    docs: {
      description: {
        story:
          "Wrap related boolean controls in a `FieldSet` with a `FieldLegend` for semantic grouping — the legend serves as a single accessible label for the entire set, and `FieldDescription` right after the legend applies an extra top-negative-margin to tuck it close."
      }
    }
  },
  render: () => (
    <FieldSet className="w-96">
      <FieldLegend>Notifications</FieldLegend>
      <FieldDescription>Choose which events should email you.</FieldDescription>
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox id="notify-deploys" defaultChecked />
          <FieldContent>
            <FieldTitle>Deploy events</FieldTitle>
            <FieldDescription>When a deploy completes, fails, or is rolled back.</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="notify-access" />
          <FieldContent>
            <FieldTitle>Access changes</FieldTitle>
            <FieldDescription>When roles or permissions change for this project.</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="notify-billing" defaultChecked />
          <FieldContent>
            <FieldTitle>Billing updates</FieldTitle>
            <FieldDescription>Invoices, plan changes, and usage alerts.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
};
