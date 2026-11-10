import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { CodeBlock } from "@app/components/v4/ui/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import type { KmipClientCertificate } from "@app/hooks/api/kmip/types";

const download = (value: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const DownloadButton = ({
  value,
  filename,
  label
}: {
  value: string;
  filename: string;
  label: string;
}) => (
  <Button
    variant="ghost"
    size="icon-xs"
    icon="download"
    iconOnly
    onClick={() => download(value, filename)}
  >
    {label}
  </Button>
);

export const KmipCertificateDialog = ({
  certificate,
  onClose
}: {
  certificate: KmipClientCertificate;
  onClose: () => void;
}) => {
  const [revealed, setRevealed] = useState(false);
  const { privateKey } = certificate;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>KMIP client certificate</DialogTitle>
          {privateKey && (
            <DialogDescription>
              The private key is shown once. Save it before you close.
            </DialogDescription>
          )}
        </DialogHeader>
        <Stack gap={16}>
          <CodeBlock
            label="Serial number"
            code={certificate.serialNumber}
            copyLabel="Copy serial number"
          />
          <CodeBlock
            label="Certificate body"
            code={certificate.certificate}
            copyLabel="Copy certificate body"
            actions={
              <DownloadButton
                value={certificate.certificate}
                filename="cert.pem"
                label="Download certificate body"
              />
            }
          />
          {certificate.certificateChain && (
            <CodeBlock
              label="Certificate chain"
              code={certificate.certificateChain}
              copyLabel="Copy certificate chain"
              actions={
                <DownloadButton
                  value={certificate.certificateChain}
                  filename="chain.pem"
                  label="Download certificate chain"
                />
              }
            />
          )}
          {privateKey && (
            <CodeBlock
              label="Private key"
              copyValue={privateKey}
              copyLabel="Copy private key"
              actions={
                <Inline gap={4} wrap={false}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    icon="eye"
                    iconOnly
                    aria-pressed={revealed}
                    onClick={() => setRevealed((current) => !current)}
                  >
                    {revealed ? "Hide private key" : "Reveal private key"}
                  </Button>
                  <DownloadButton
                    value={privateKey}
                    filename="private_key.txt"
                    label="Download private key"
                  />
                </Inline>
              }
            >
              {revealed ? privateKey : "•".repeat(48)}
            </CodeBlock>
          )}
        </Stack>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
