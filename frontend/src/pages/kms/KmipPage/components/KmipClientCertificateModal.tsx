import FileSaver from "file-saver";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { KmipClientCertificate } from "@app/hooks/api/kmip/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  certificate: KmipClientCertificate;
};

const CertificateSection = ({
  title,
  value,
  filename
}: {
  title: string;
  value: string;
  filename?: string;
}) => {
  const [copyLabel, isCopied, setCopyLabel] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">{title}</h3>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`Copy ${title}`}
                onClick={() => {
                  navigator.clipboard.writeText(value);
                  setCopyLabel("Copied");
                }}
              >
                {isCopied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>{copyLabel}</TooltipContent>
          </Tooltip>
          {filename && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Download ${title}`}
                  onClick={() =>
                    FileSaver.saveAs(
                      new Blob([value], { type: "text/plain;charset=utf-8" }),
                      filename
                    )
                  }
                >
                  <DownloadIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <pre className="max-h-56 overflow-auto rounded-md border border-border bg-container p-3 font-mono text-xs break-all whitespace-pre-wrap text-foreground">
        {value}
      </pre>
    </section>
  );
};

export const KmipClientCertificateModal = ({ isOpen, onOpenChange, certificate }: Props) => {
  if (!certificate) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>KMIP Client Certificate</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <CertificateSection title="Serial Number" value={certificate.serialNumber} />
          <CertificateSection
            title="Certificate Body"
            value={certificate.certificate}
            filename="cert.pem"
          />
          {certificate.certificateChain && (
            <CertificateSection
              title="Certificate Chain"
              value={certificate.certificateChain}
              filename="chain.pem"
            />
          )}
          {certificate.privateKey && (
            <CertificateSection
              title="Certificate Private Key"
              value={certificate.privateKey}
              filename="private_key.txt"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
