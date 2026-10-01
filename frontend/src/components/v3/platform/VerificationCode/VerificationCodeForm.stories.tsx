import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";

import { Alert, AlertDescription, AlertTitle } from "../../generic/Alert";
import { Button } from "../../generic/Button";
import { CardContent } from "../../generic/Card";
import { VerificationCodeForm, VerificationCodeHeader } from "./VerificationCodeForm";
import { VerificationCodeResend } from "./VerificationCodeResend";

const meta = {
  title: "Authentication/VerificationCodeForm",
  component: VerificationCodeForm,
  parameters: {
    layout: "centered",
    controls: { disable: true }
  },
  decorators: [
    (Story) => (
      <div className="w-[min(28rem,calc(100vw-2rem))]">
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

const VerificationDemo = ({ fields }: { fields: number }) => {
  const [value, setValue] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "invalid" | "verified">("idle");
  const [isResending, setIsResending] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const validCode = fields === 6 ? "123456" : "abcdefgh";

  useEffect(() => {
    if (status !== "verifying") return undefined;

    const timer = window.setTimeout(() => {
      setStatus(submittedCode === validCode ? "verified" : "invalid");
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [status, submittedCode, validCode]);

  useEffect(() => {
    if (!isResending) return undefined;

    const timer = window.setTimeout(() => {
      setIsResending(false);
      setRemainingSeconds(5);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [isResending]);

  useEffect(() => {
    if (remainingSeconds === 0) return undefined;

    const timer = window.setTimeout(() => setRemainingSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remainingSeconds]);

  return (
    <AuthPagePanel>
      <VerificationCodeHeader
        title={fields === 6 ? "We've sent a verification code to" : "Use a recovery code"}
        recipient={fields === 6 ? "operator@infisical.com" : undefined}
        description={fields === 8 ? "Enter one of your backup recovery codes." : undefined}
      />
      <CardContent>
        {status === "verified" ? (
          <Alert variant="success">
            <AlertTitle>Code verified</AlertTitle>
            <AlertDescription>This demo does not sign you in or contact a server.</AlertDescription>
          </Alert>
        ) : (
          <VerificationCodeForm
            key={formKey}
            name={`verification-story-${fields}`}
            fields={fields}
            value={value}
            onChange={setValue}
            onSubmit={() => {
              setSubmittedCode(value);
              setStatus("verifying");
            }}
            isPending={status === "verifying"}
            isDisabled={isResending}
            error={status === "invalid" ? "That code is invalid. Try again." : undefined}
          >
            {fields === 6 && (
              <VerificationCodeResend
                isResending={isResending}
                isDisabled={status === "verifying"}
                remainingSeconds={remainingSeconds}
                onResend={() => {
                  setValue("");
                  setStatus("idle");
                  setFormKey((key) => key + 1);
                  setIsResending(true);
                }}
              />
            )}
          </VerificationCodeForm>
        )}
      </CardContent>
    </AuthPagePanel>
  );
};

const InteractiveExample = ({ initialFields = 6 }: { initialFields?: number }) => {
  const [fields, setFields] = useState(initialFields);
  const [session, setSession] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3 text-sm text-label">
        <p>
          Interactive demo. Type {fields === 6 ? "123456" : "abcdefgh"} to succeed, or any other
          complete code to try the error and retry flow. The first complete code submits
          automatically. No requests are sent.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setFields(fields === 6 ? 8 : 6)}>
            {fields === 6 ? "Use a recovery code" : "Use an email code"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSession((key) => key + 1)}>
            Restart demo
          </Button>
        </div>
      </div>
      <VerificationDemo key={`${fields}-${session}`} fields={fields} />
    </div>
  );
};

export const EmailCode: Story = {
  render: () => <InteractiveExample />
};

export const RecoveryCode: Story = {
  render: () => <InteractiveExample initialFields={8} />
};
