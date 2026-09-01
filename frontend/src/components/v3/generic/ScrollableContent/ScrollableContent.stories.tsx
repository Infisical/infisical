import { useId, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "../Checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from "../Field";
import { ScrollableContent } from "./ScrollableContent";

const options = [
  ["Email", "Allow users to sign in with an email address and password."],
  ["Google SSO", "Allow users to sign in with Google."],
  ["GitHub SSO", "Allow users to sign in with GitHub."],
  ["GitLab SSO", "Allow users to sign in with GitLab."],
  ["SAML SSO", "Available after a SAML provider is configured."],
  ["OIDC SSO", "Available after an OIDC provider is configured."],
  ["LDAP", "Available after an LDAP provider is configured."]
] as const;

const meta = {
  title: "Generic/ScrollableContent",
  component: ScrollableContent,
  tags: ["autodocs"],
  args: {
    "aria-label": "Authentication methods",
    edgeBehavior: "none",
    outline: true,
    showScrollers: false,
    size: "lg"
  },
  argTypes: {
    edgeBehavior: {
      control: "select",
      options: ["none", "fade", "border"]
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"]
    },
    outline: {
      control: "boolean"
    },
    showScrollers: {
      control: "boolean"
    }
  },
  parameters: {
    docs: {
      description: {
        component:
          "Constrains a vertical content stack, keeps its scrollbar outside the content width, and reveals an edge treatment only while more content is available in that direction. Use it for option stacks or information groups, not for virtualizing large datasets."
      }
    }
  }
} satisfies Meta<typeof ScrollableContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OptionStack: Story = {
  render: function Render(args) {
    const [selected, setSelected] = useState(["Email", "Google SSO", "GitHub SSO"]);
    const optionIdPrefix = useId();

    return (
      <ScrollableContent {...args} className="w-xl">
        <FieldGroup className="gap-1">
          {options.map(([label, description], index) => {
            const isChecked = selected.includes(label);
            const optionId = `${optionIdPrefix}-option-${index}`;

            return (
              <FieldLabel key={label} htmlFor={optionId}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    <FieldDescription>{description}</FieldDescription>
                  </FieldContent>
                  <Checkbox
                    id={optionId}
                    aria-label={label}
                    isChecked={isChecked}
                    onCheckedChange={(checked) => {
                      setSelected((current) =>
                        checked ? [...current, label] : current.filter((value) => value !== label)
                      );
                    }}
                  />
                </Field>
              </FieldLabel>
            );
          })}
        </FieldGroup>
      </ScrollableContent>
    );
  }
};

export const BorderEdges: Story = {
  args: {
    edgeBehavior: "border"
  },
  render: OptionStack.render
};

export const FadeEdges: Story = {
  args: {
    edgeBehavior: "fade"
  },
  render: OptionStack.render
};

export const WithScrollers: Story = {
  args: {
    showScrollers: true
  },
  render: OptionStack.render
};

export const WithoutOutline: Story = {
  args: {
    outline: false
  },
  render: OptionStack.render
};
