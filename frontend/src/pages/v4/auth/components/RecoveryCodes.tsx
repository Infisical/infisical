import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { toast } from "@app/components/v4/ui/sonner";

import { AuthPage } from "./AuthPage";

import styles from "../auth.module.css";

type Props = {
  recoveryCodes: string[];
  isPending?: boolean;
  onContinue: () => void;
};

export const RecoveryCodes = ({ recoveryCodes, isPending, onContinue }: Props) => {
  const [copied, setCopied] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  const handleDownload = () => {
    const blob = new Blob([recoveryCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `infisical-recovery-codes-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy recovery codes. Please download them instead.");
    }
  };

  return (
    <AuthPage
      pageTitle="Two-Factor Authentication"
      title="Save your recovery codes"
      description="Each code works once and lets you sign in if you lose access to your other methods."
    >
      <Stack gap={12}>
        <ol className={styles.codes}>
          {recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <Inline gap={8} wrap={false}>
          <Button
            type="button"
            variant="outline"
            icon="download"
            className="flex-1"
            onClick={handleDownload}
          >
            Download
          </Button>
          <Button
            type="button"
            variant="outline"
            icon="copy"
            className="flex-1"
            onClick={handleCopy}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </Inline>
      </Stack>
      <Checkbox
        label="I have saved my recovery codes in a safe place"
        checked={isAcknowledged}
        onCheckedChange={(checked) => setIsAcknowledged(checked === true)}
      />
      <Button
        type="button"
        variant="accent"
        size="lg"
        className="w-full"
        loading={isPending}
        disabledReason={isAcknowledged ? undefined : "Confirm you saved your recovery codes first"}
        onClick={onContinue}
      >
        Continue
      </Button>
    </AuthPage>
  );
};
