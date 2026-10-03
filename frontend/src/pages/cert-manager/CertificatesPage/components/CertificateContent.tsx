import { useState } from "react";
import FileSaver from "file-saver";
import { CheckIcon, CopyIcon, DownloadIcon, EyeIcon, EyeOffIcon } from "lucide-react";

import {
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

type Props = {
  serialNumber: string;
  certificate: string;
  certificateChain?: string;
  privateKey?: string;
};

const downloadTxtFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  FileSaver.saveAs(blob, filename);
};

const CopyAction = ({ value, label }: { value: string; label: string }) => {
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-label={`Copy ${label}`}
          variant="ghost-muted"
          size="xs"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopyText("Copied");
          }}
        >
          {isCopying ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>{isCopying ? "Copied" : `Copy ${label}`}</TooltipContent>
    </Tooltip>
  );
};

const PemSection = ({
  title,
  value,
  filename,
  isSensitive
}: {
  title: string;
  value: string;
  filename: string;
  isSensitive?: boolean;
}) => {
  const [isVisible, setIsVisible] = useState(!isSensitive);
  const label = title.toLowerCase();

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <div className="flex items-center gap-1">
          {isSensitive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
                  variant="ghost-muted"
                  size="xs"
                  onClick={() => setIsVisible((prev) => !prev)}
                >
                  {isVisible ? <EyeOffIcon /> : <EyeIcon />}
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>{isVisible ? "Hide" : "Show"}</TooltipContent>
            </Tooltip>
          )}
          <CopyAction value={value} label={label} />
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label={`Download ${label}`}
                variant="ghost-muted"
                size="xs"
                onClick={() => downloadTxtFile(filename, value)}
              >
                <DownloadIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Download {filename}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {isVisible ? (
        <pre className="max-h-40 thin-scrollbar overflow-auto rounded-md border border-border bg-container px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre text-foreground">
          {value}
        </pre>
      ) : (
        <div className="rounded-md border border-border bg-container px-3 py-2.5 font-mono text-xs text-muted select-none">
          ••••••••••••••••••••••••••••••••
        </div>
      )}
    </section>
  );
};

export const CertificateContent = ({
  serialNumber,
  certificate,
  certificateChain,
  privateKey
}: Props) => {
  return (
    <TooltipProvider>
      <div className="flex min-w-0 flex-col gap-5">
        <section>
          <span className="mb-2 block text-sm font-medium text-foreground">Serial Number</span>
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-container py-1 pr-1 pl-3">
            <span className="font-mono text-xs break-all text-foreground">{serialNumber}</span>
            <CopyAction value={serialNumber} label="serial number" />
          </div>
        </section>
        <PemSection title="Certificate Body" value={certificate} filename="cert.pem" />
        {certificateChain && (
          <PemSection title="Certificate Chain" value={certificateChain} filename="chain.pem" />
        )}
        {privateKey && (
          <PemSection
            title="Private Key"
            value={privateKey}
            filename="private_key.pem"
            isSensitive
          />
        )}
      </div>
    </TooltipProvider>
  );
};
