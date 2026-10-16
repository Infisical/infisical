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
      '  "API_KEY": "a1b2\u2062c3d4e5",',
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
          "Codepoints that paint as a normal space, or as nothing at all, are marked so they can be spotted in a pasted value. Detection uses Unicode categories (control, format, and space or separator characters) rather than a fixed list. Left to right: a non-breaking space (U+00A0), an invisible times (U+2062), a zero-width space (U+200B), a byte order mark (U+FEFF), and a non-breaking space inside a secret reference, which stops the reference resolving."
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

export const UnicodeText: Story = {
  args: {
    isVisible: true,
    value: [
      "GREETING=caf\u00e9 na\u00efve \u03a9\u03bc\u03ad\u03b3\u03b1",
      "CJK=\u65e5\u672c\u8a9e \ud55c\uad6d\uc5b4",
      "RTL=\u0645\u0631\u062d\u0628\u0627",
      "EMOJI=\u{1F600} \u{1F44D}\u{1F3FD} \u{1F468}\u200d\u{1F469}\u200d\u{1F467} \u{1F3F3}\ufe0f\u200d\u{1F308} \u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}"
    ].join("\n"),
    variant: "plain"
  },
  parameters: {
    docs: {
      description: {
        story:
          "Ordinary non-ASCII text is not flagged: accented letters, CJK, right-to-left scripts, and emoji, including emoji joined with zero-width joiners or tag characters."
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
