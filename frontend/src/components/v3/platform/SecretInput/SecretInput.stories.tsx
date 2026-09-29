import type { Meta, StoryObj } from "@storybook/react-vite";

import { SecretInput } from "./SecretInput";

const REFERENCE_WITH_NBSP = `\${FOO${"\u00a0"}BAR}`;

const meta = {
  title: "Platform/SecretInput",
  component: SecretInput,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "plain"]
    },
    value: {
      control: "text"
    },
    containerClassName: {
      table: { disable: true }
    }
  },
  args: {
    onChange: () => undefined,
    value: "secret-value",
    variant: "default"
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
} satisfies Meta<typeof SecretInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Use the framed variant for secret values in forms."
      }
    }
  }
};

export const InvisibleCharacters: Story = {
  args: {
    isVisible: true,
    value: [
      "{",
      '  "BASE_URL":\u00a0"https://example.com",',
      '  "API_KEY": "a1b2c3d4e5",',
      '  "TIMEOUT": 30\u200b',
      "\ufeff}",
      REFERENCE_WITH_NBSP
    ].join("\n"),
    variant: "plain"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Codepoints that paint as a normal space, or as nothing at all, are marked so they can be spotted in a pasted value. Left to right: a non-breaking space (U+00A0), a zero-width space (U+200B), a byte order mark (U+FEFF), and a non-breaking space inside a secret reference, which stops the reference resolving."
      }
    }
  }
};

export const InvisibleCharactersMasked: Story = {
  args: {
    value: 'API_URL=\u00a0"https://example.com"\u200b'
  },
  parameters: {
    docs: {
      description: {
        story:
          "The warning icon stays visible while the value is masked, and its tooltip lists the invisible characters by type without revealing the value."
      }
    }
  }
};

export const Plain: Story = {
  args: {
    variant: "plain"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Use the plain variant for inline editing where the surrounding surface already provides the field boundary, such as an editable table cell."
      }
    }
  }
};
