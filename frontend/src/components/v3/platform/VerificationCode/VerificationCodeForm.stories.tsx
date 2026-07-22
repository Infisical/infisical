import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";

import { CardContent } from "../../generic/Card";
import { VerificationCodeForm, VerificationCodeHeader } from "./VerificationCodeForm";

const meta = {
  title: "Authentication/VerificationCodeForm",
  component: VerificationCodeForm,
  parameters: {
    layout: "centered"
  },
  decorators: [
    (Story) => (
      <div className="w-[28rem] max-w-[calc(100vw-2rem)]">
        <Story />
      </div>
    )
  ],
  tags: ["autodocs"],
  args: {
    name: "verification-code",
    onChange: () => undefined,
    onSubmit: () => undefined,
    value: ""
  }
} satisfies Meta<typeof VerificationCodeForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const VerificationExample = ({ fields = 6, error }: { fields?: number; error?: string }) => {
  const [value, setValue] = useState("");

  return (
    <AuthPagePanel>
      <VerificationCodeHeader
        title={fields === 6 ? "We've sent a verification code to" : "Use a recovery code"}
        recipient={fields === 6 ? "operator@infisical.com" : undefined}
        description={fields === 8 ? "Enter one of your backup recovery codes." : undefined}
      />
      <CardContent>
        <VerificationCodeForm
          name={`verification-story-${fields}`}
          fields={fields}
          value={value}
          onChange={setValue}
          onSubmit={() => undefined}
          error={error}
        >
          <p className="text-sm text-label">Don&apos;t see the code? Resend</p>
        </VerificationCodeForm>
      </CardContent>
    </AuthPagePanel>
  );
};

export const EmailCode: Story = {
  render: () => <VerificationExample />
};

export const InvalidCode: Story = {
  render: () => <VerificationExample error="That code is invalid. Try again." />
};

export const RecoveryCode: Story = {
  render: () => <VerificationExample fields={8} />
};
