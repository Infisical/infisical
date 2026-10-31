import { useMemo } from "react";
import * as x509 from "@peculiar/x509";
import { CircleXIcon, CopyIcon, DownloadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Loader,
  ScrollableContent
} from "@app/components/v3";
import { downloadTxtFile } from "@app/helpers/download";
import { useGetCaCsr } from "@app/hooks/api";

import { getServerErrorMessage } from "./crossSignedCertUtils";

type Props = {
  caId: string;
  caName: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const CsrContent = ({ caId, caName }: Pick<Props, "caId" | "caName">) => {
  const { data: csr, isPending, error } = useGetCaCsr(caId);

  const csrSubject = useMemo(
    () => (csr ? new x509.Pkcs10CertificateRequest(csr).subject : null),
    [csr]
  );

  return (
    <>
      <DialogBody>
        {isPending && (
          <div className="flex h-40 w-full items-center justify-center">
            <Loader />
          </div>
        )}
        {error && (
          <Alert variant="danger">
            <CircleXIcon />
            <AlertTitle>Couldn&apos;t generate a CSR</AlertTitle>
            <AlertDescription>{getServerErrorMessage(error, "Try again.")}</AlertDescription>
          </Alert>
        )}
        {csr && (
          <DetailGroup>
            <Detail>
              <DetailLabel>Subject</DetailLabel>
              <DetailValue className="font-mono text-xs break-all">{csrSubject}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>CSR</DetailLabel>
              <ScrollableContent
                aria-label="Certificate signing request"
                size="sm"
                edgeBehavior="fade"
                outline={false}
                containerClassName="rounded-md border border-border bg-container"
              >
                <pre className="p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-foreground">
                  {csr}
                </pre>
              </ScrollableContent>
            </Detail>
          </DetailGroup>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          type="button"
          isDisabled={!csr}
          onClick={async () => {
            await navigator.clipboard.writeText(csr!);
            createNotification({ text: "Copied to clipboard", type: "success" });
          }}
        >
          <CopyIcon />
          Copy
        </Button>
        <Button
          variant="project"
          type="button"
          isDisabled={!csr}
          onClick={() => downloadTxtFile(`${caName}.csr`, csr!)}
        >
          <DownloadIcon />
          Download
        </Button>
      </DialogFooter>
    </>
  );
};

export const CaCrossSignedCertCsrDialog = ({ caId, caName, isOpen, onOpenChange }: Props) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Generate CSR</DialogTitle>
        <DialogDescription>Have your old CA sign this CSR as a CA certificate.</DialogDescription>
      </DialogHeader>
      <CsrContent caId={caId} caName={caName} />
    </DialogContent>
  </Dialog>
);
