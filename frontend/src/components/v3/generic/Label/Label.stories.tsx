import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "../Input";
import { Switch } from "../Switch";
import { Label } from "./Label";

/**
 * `Label` is the v3 form-label primitive — a styled `<label>` built on Radix.
 * It auto-handles the `htmlFor` association, dims when a sibling input is
 * `disabled` (via the `peer-disabled` selector), and dims inside a disabled
 * group (via `data-disabled="true"` on a parent with the `group` class).
 *
 * Most of the time you don't reach for `Label` directly — instead, use
 * `FieldLabel` from `../Field`, which composes `Label` with the form-field
 * spacing and accessibility wiring. Reach for the bare `Label` for one-off
 * inline pairings outside the `Field` system (toggle rows, table headers
 * with controls, ad-hoc settings strips).
 */
const meta = {
  title: "Generic/Label",
  component: Label,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: "text"
    }
  },
  args: {
    children: "Workspace name"
  }
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Bare label text. Use as the building block for any form-control pairing — but prefer `FieldLabel` whenever you also need the v3 form-field spacing and accessibility plumbing."
      }
    }
  }
};

export const WithInput: Story = {
  name: "Example: With Input",
  parameters: {
    docs: {
      description: {
        story:
          "Pair a `Label`'s `htmlFor` with the input's `id` so clicking the label focuses the field. This is the minimum accessible association — without it, the label is just decorative text."
      }
    }
  },
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Label htmlFor="label-input">Workspace name</Label>
      <Input id="label-input" placeholder="Acme Corporation" />
    </div>
  )
};

export const InlineWithSwitch: Story = {
  name: "Example: Inline With Switch",
  parameters: {
    docs: {
      description: {
        story:
          "Use `Label` as the inline label for a `Switch` (or `Checkbox`) when you don't need a description below — for example, settings toggle rows. Place the label and control as flex siblings; the label inherits the row's vertical alignment."
      }
    }
  },
  render: () => (
    <div className="flex w-80 items-center gap-3">
      <Switch id="label-mfa" />
      <Label htmlFor="label-mfa">Require MFA on sign-in</Label>
    </div>
  )
};

export const InDisabledGroup: Story = {
  name: "State: In Disabled Group",
  parameters: {
    docs: {
      description: {
        story:
          'When the parent has the `group` class and `data-disabled="true"`, the label dims to 50% opacity automatically. This is how `Field`/`FieldGroup` propagate disabled state down — wrap your own controls the same way for an ad-hoc disabled section.'
      }
    }
  },
  render: () => (
    <div className="group flex w-80 flex-col gap-2" data-disabled="true">
      <Label htmlFor="label-disabled">Email</Label>
      <Input id="label-disabled" defaultValue="scott@infisical.com" disabled />
    </div>
  )
};
