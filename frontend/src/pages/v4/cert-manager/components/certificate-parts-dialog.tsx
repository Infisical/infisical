import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { HIDDEN_SECRET_VALUE } from "@infisical/cipher/ui/secret-input";
import { CopyValue } from "@infisical/cipher/ui/sensitive-editor";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import FileSaver from "file-saver";

import type { TCertificate } from "@app/hooks/api/certificates/types";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { usePkcs12Block } from "./certificate-export";

const IconAction = ({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: "download" | "eye" | "eye-off";
  onClick: () => void;
}) => (
  <Tooltip content={label}>
    <Button
      variant="ghost"
      size="icon-sm"
      icon={icon}
      iconOnly
      aria-label={label}
      onClick={onClick}
    >
      {label}
    </Button>
  </Tooltip>
);

const PemBlock = ({
  label,
  value,
  fileName,
  sensitive
}: {
  label: string;
  value: string;
  fileName: string;
  sensitive?: boolean;
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const revealed = !sensitive || isRevealed;
  const noun = label.toLowerCase();
  return (
    <CodeBlock
      label={label}
      code={revealed ? value.trim() : HIDDEN_SECRET_VALUE}
      copyValue={value}
      copyLabel={`Copy ${noun}`}
      onCopy={() => saved(`${label} copied`)}
      format="plain"
      maxHeight={176}
      actions={
        <>
          {sensitive && (
            <IconAction
              label={revealed ? `Hide ${noun}` : `Reveal ${noun}`}
              icon={revealed ? "eye-off" : "eye"}
              onClick={() => setIsRevealed((current) => !current)}
            />
          )}
          <IconAction
            label={`Download ${fileName}`}
            icon="download"
            onClick={() => {
              FileSaver.saveAs(new Blob([value], { type: "text/plain;charset=utf-8" }), fileName);
              saved(`${fileName} downloaded`);
            }}
          />
        </>
      }
    />
  );
};

const CertificateParts = ({ cert, projectId }: { cert: TCertificate; projectId: string }) => {
  const certificates = useV4Adapter("certificates");
  const canReadPrivateKey = !usePkcs12Block(cert, projectId);
  const bundle = certificates.useCertificateBundle(canReadPrivateKey ? cert.serialNumber : "");
  const body = certificates.useCertificateBody(cert.serialNumber);
  const data = bundle.data ?? body.data;
  if (!data && body.error) return <Alert tone="bad">Couldn&apos;t load this certificate.</Alert>;
  if (!data) return <Loader label="Loading certificate" />;
  return (
    <Stack gap={16}>
      <Field label="Serial number" wide>
        <CopyValue
          value={data.serialNumber}
          label="Copy serial number"
          onCopy={() => saved("Serial number copied")}
        >
          <Code>{data.serialNumber}</Code>
        </CopyValue>
      </Field>
      <PemBlock label="Certificate body" value={data.certificate} fileName="cert.pem" />
      {data.certificateChain && (
        <PemBlock label="Certificate chain" value={data.certificateChain} fileName="chain.pem" />
      )}
      {data.privateKey && (
        <PemBlock
          label="Private key"
          value={data.privateKey}
          fileName="private_key.pem"
          sensitive
        />
      )}
    </Stack>
  );
};

export const CertificatePartsDialog = ({
  cert,
  projectId,
  onClose
}: {
  cert?: TCertificate;
  projectId: string;
  onClose: () => void;
}) => (
  <Dialog open={Boolean(cert)} onOpenChange={(open) => !open && onClose()}>
    {cert && (
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Export certificate</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <CertificateParts cert={cert} projectId={projectId} />
        </DialogBody>
      </DialogContent>
    )}
  </Dialog>
);
