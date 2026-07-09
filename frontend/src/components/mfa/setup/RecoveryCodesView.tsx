import { useState } from "react";
import { CopyIcon, DownloadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, FieldLabel } from "@app/components/v3";

type Acknowledgment = {
  isAcknowledged: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  confirmLabel: string;
  onConfirm: () => void;
  isConfirmPending?: boolean;
  labelClassName?: string;
};

type Props = {
  recoveryCodes: string[];
  onSaved?: () => void;
  acknowledgment?: Acknowledgment;
};

export const RecoveryCodesView = ({ recoveryCodes, onSaved, acknowledgment }: Props) => {
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const content = recoveryCodes.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `infisical-recovery-codes-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onSaved?.();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onSaved?.();
    } catch {
      createNotification({
        text: "Failed to copy recovery codes. Please download them instead.",
        type: "error"
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-container p-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
          {recoveryCodes.map((code, index) => (
            <div key={code} className="flex items-center text-foreground">
              <span className="w-6 text-right text-muted">{index + 1}.</span>
              <span className="pl-2">{code}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="org" isFullWidth onClick={handleDownload}>
          <DownloadIcon /> Download
        </Button>
        <Button variant="outline" isFullWidth onClick={handleCopy}>
          <CopyIcon /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {acknowledgment && (
        <div className="mt-1 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="acknowledge-recovery-codes"
              variant="org"
              isChecked={acknowledgment.isAcknowledged}
              onCheckedChange={(checked) => acknowledgment.onAcknowledgedChange(checked === true)}
            />
            <FieldLabel
              htmlFor="acknowledge-recovery-codes"
              className={`cursor-pointer text-sm font-normal ${
                acknowledgment.labelClassName ?? "text-foreground"
              }`}
            >
              I have saved my recovery codes in a safe place
            </FieldLabel>
          </div>
          <Button
            variant="org"
            isFullWidth
            isDisabled={!acknowledgment.isAcknowledged}
            isPending={acknowledgment.isConfirmPending}
            onClick={acknowledgment.onConfirm}
          >
            {acknowledgment.confirmLabel}
          </Button>
        </div>
      )}
    </div>
  );
};
