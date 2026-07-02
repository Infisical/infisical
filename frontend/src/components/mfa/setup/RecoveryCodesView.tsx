import { useState } from "react";
import { CopyIcon, DownloadIcon } from "lucide-react";

import { Button } from "@app/components/v3";

type Props = {
  recoveryCodes: string[];
  onDownloaded?: () => void;
};

export const RecoveryCodesView = ({ recoveryCodes, onDownloaded }: Props) => {
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
    onDownloaded?.();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failures
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
          <CopyIcon /> {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
};
