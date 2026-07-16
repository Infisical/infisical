import FileSaver from "file-saver";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { useExportSignerCertificate } from "@app/hooks/api/signers";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signerId: string;
  signerName: string;
};

export const ExportSignerCertModal = ({ isOpen, onOpenChange, signerId, signerName }: Props) => {
  const { data, isLoading } = useExportSignerCertificate(signerId, isOpen);

  const [, didCopySerial, setCopySerialLabel] = useTimedReset<string>({
    initialState: "Copy"
  });
  const [, didCopyPem, setCopyPemLabel] = useTimedReset<string>({
    initialState: "Copy"
  });

  const onCopySerial = async () => {
    if (!data?.serialNumber) return;
    await navigator.clipboard.writeText(data.serialNumber);
    setCopySerialLabel("Copied");
  };

  const onCopyPem = async () => {
    if (!data?.certificatePem) return;
    await navigator.clipboard.writeText(data.certificatePem);
    setCopyPemLabel("Copied");
  };

  const onDownload = () => {
    if (!data?.certificatePem) return;
    try {
      const blob = new Blob([data.certificatePem], { type: "application/x-pem-file" });
      FileSaver.saveAs(blob, `${signerName || data.signerName || "signer"}.pem`);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to download certificate"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export certificate</DialogTitle>
          <DialogDescription>
            The signer&apos;s public certificate. The private key never leaves the server and is not
            included here.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="py-8">
            <PageLoader />
          </div>
        ) : (
          <TooltipProvider>
            <div className="flex flex-col gap-5">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Serial number</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={onCopySerial}
                        aria-label="Copy serial number"
                      >
                        {didCopySerial ? <CheckIcon /> : <CopyIcon />}
                        {didCopySerial ? "Copied" : "Copy"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy serial number</TooltipContent>
                  </Tooltip>
                </div>
                <div className="rounded-md border border-border bg-mineshaft-900 px-3 py-2 font-mono text-xs break-all text-foreground">
                  {data.serialNumber || "—"}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Certificate body</span>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={onCopyPem}
                          aria-label="Copy certificate PEM"
                        >
                          {didCopyPem ? <CheckIcon /> : <CopyIcon />}
                          {didCopyPem ? "Copied" : "Copy"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy PEM</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={onDownload}
                          aria-label="Download certificate PEM"
                        >
                          <DownloadIcon />
                          Download
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download .pem</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <pre className="max-h-72 thin-scrollbar overflow-y-auto rounded-md border border-border bg-mineshaft-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-mineshaft-200">
                  {data.certificatePem}
                </pre>
              </section>
            </div>
          </TooltipProvider>
        )}
      </DialogContent>
    </Dialog>
  );
};
