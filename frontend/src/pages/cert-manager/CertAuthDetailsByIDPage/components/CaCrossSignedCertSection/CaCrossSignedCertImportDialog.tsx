import { useId, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as x509 from "@peculiar/x509";
import { CheckIcon, CircleCheckIcon, CircleXIcon, XIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  TextArea
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useGetCaCert, useImportCaCrossSignedCert } from "@app/hooks/api";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import {
  countPemCertificates,
  formatCertificateDate,
  getServerErrorMessage
} from "./crossSignedCertUtils";

type Props = {
  caId: string;
  caName: string;
  isReplace: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const schema = z.object({
  certificate: z.string().trim(),
  certificateChain: z.string().trim()
});

type FormData = z.infer<typeof schema>;

type TCheckItem = { isPassed: boolean; text: string; isFixedByCsr?: boolean };

const parseCertificate = (pem: string) => {
  try {
    return new x509.X509Certificate(pem);
  } catch {
    return null;
  }
};

const checkCrossSignedCert = (certificatePem: string, caCertPem: string, caName: string) => {
  const cert = parseCertificate(certificatePem);
  const caCert = parseCertificate(caCertPem);
  if (!cert || !caCert) return null;

  const isSameSubject = cert.subject === caCert.subject;
  const isSameKey = cert.publicKey.equal(caCert.publicKey);
  const issuerName = cert.issuerName.getField("CN")[0] ?? cert.issuer;
  const notAfter = formatCertificateDate(cert.notAfter);

  const isCa = Boolean(cert.getExtension(x509.BasicConstraintsExtension)?.ca);

  const getSignerItem = (): TCheckItem => {
    if (cert.equal(caCert)) {
      return {
        isPassed: false,
        text: "This is the CA's own certificate. Import the cross-signed certificate your old CA signed."
      };
    }
    if (cert.notAfter <= new Date()) {
      return { isPassed: false, text: `Expired on ${notAfter}` };
    }
    return { isPassed: true, text: `Signed by ${issuerName}, valid until ${notAfter}` };
  };

  const items: TCheckItem[] = [
    ...(countPemCertificates(certificatePem) > 1
      ? [
          {
            isPassed: false,
            text: "Paste only the cross-signed certificate here. Put the rest in Certificate Chain."
          }
        ]
      : []),
    isSameSubject
      ? { isPassed: true, text: `Same subject as ${caName}` }
      : { isPassed: false, text: "Different subject", isFixedByCsr: true },
    isSameKey
      ? { isPassed: true, text: `Same key as ${caName}` }
      : { isPassed: false, text: "Different key", isFixedByCsr: true },
    isCa
      ? { isPassed: true, text: "CA certificate" }
      : {
          isPassed: false,
          text: "Not a CA certificate. Have the old CA sign the CSR as a CA certificate."
        },
    getSignerItem()
  ];

  return {
    items,
    isMatchingCa: isSameSubject && isSameKey,
    isFixedByCsr: items.some((item) => !item.isPassed && item.isFixedByCsr),
    isPassed: items.every((item) => item.isPassed)
  };
};

export const CaCrossSignedCertImportDialog = ({
  caId,
  caName,
  isReplace,
  isOpen,
  onOpenChange
}: Props) => {
  const formId = useId();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: caCert } = useGetCaCert(caId);
  const { mutateAsync: importCrossSignedCert } = useImportCaCrossSignedCert();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { certificate: "", certificateChain: "" }
  });

  const certificateText = watch("certificate").trim();

  const check = useMemo(
    () =>
      certificateText && caCert
        ? checkCrossSignedCert(certificateText, caCert.certificate, caName)
        : null,
    [certificateText, caCert, caName]
  );

  const close = () => {
    reset();
    setServerError(null);
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: close });

  const handleOpenChange = (open: boolean) => {
    if (isSubmitting) return;
    if (open) onOpenChange(true);
    else requestDiscard();
  };

  const onSubmit = async ({ certificate, certificateChain }: FormData) => {
    setServerError(null);
    try {
      await importCrossSignedCert({
        caId,
        certificate,
        ...(certificateChain && { certificateChain })
      });
      createNotification({
        text: isReplace ? "Cross-signed certificate replaced" : "Cross-signed certificate imported",
        type: "success"
      });
      close();
    } catch (err) {
      setServerError(getServerErrorMessage(err, "Check the certificate and try again.", true));
    }
  };

  const renderCheck = () => {
    if (serverError) {
      return (
        <Alert variant="danger">
          <CircleXIcon />
          <AlertTitle>Couldn&apos;t import this certificate</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      );
    }

    if (!certificateText || !caCert) return null;

    if (!check) {
      return (
        <Alert variant="danger">
          <CircleXIcon />
          <AlertTitle>Couldn&apos;t read this certificate</AlertTitle>
          <AlertDescription>
            Paste a PEM certificate that starts with -----BEGIN CERTIFICATE-----.
          </AlertDescription>
        </Alert>
      );
    }

    const getTitle = () => {
      if (check.isPassed) return "Ready to import";
      if (!check.isMatchingCa) return `This certificate isn't for ${caName}`;
      return "This certificate can't be imported";
    };

    return (
      <Alert variant={check.isPassed ? "success" : "danger"}>
        {check.isPassed ? <CircleCheckIcon /> : <CircleXIcon />}
        <AlertTitle>{getTitle()}</AlertTitle>
        <AlertDescription>
          {check.isFixedByCsr && <p>Have the old CA sign the CSR from this CA.</p>}
          <ul className="flex flex-col gap-1">
            {check.items.map((item) => (
              <li
                key={item.text}
                className={cn("flex items-start gap-2", item.isPassed && "text-foreground")}
              >
                {item.isPassed ? (
                  <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <XIcon className="mt-0.5 size-3.5 shrink-0" />
                )}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  };

  const action = isReplace ? "Replace" : "Import";

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent isPending={isSubmitting}>
          <DialogHeader>
            <DialogTitle>{action} Cross-Signed Certificate</DialogTitle>
            <DialogDescription>
              Paste the certificate your old CA signed from this CA&apos;s CSR.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form id={formId} onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Controller
                  control={control}
                  name="certificate"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="cross-signed-certificate">
                        Certificate <span className="text-danger">*</span>
                      </FieldLabel>
                      <TextArea
                        {...field}
                        onChange={(e) => {
                          setServerError(null);
                          field.onChange(e);
                        }}
                        id="cross-signed-certificate"
                        placeholder="-----BEGIN CERTIFICATE-----"
                        spellCheck={false}
                        rows={6}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="certificateChain"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="cross-signed-certificate-chain">
                        Certificate Chain (Optional)
                      </FieldLabel>
                      <TextArea
                        {...field}
                        onChange={(e) => {
                          setServerError(null);
                          field.onChange(e);
                        }}
                        id="cross-signed-certificate-chain"
                        placeholder="-----BEGIN CERTIFICATE-----"
                        spellCheck={false}
                        rows={4}
                      />
                      <FieldDescription>
                        The old CA&apos;s certificates, up to its root.
                      </FieldDescription>
                    </Field>
                  )}
                />
                {renderCheck()}
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              type="button"
              isDisabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="project"
              type="submit"
              form={formId}
              isPending={isSubmitting}
              isDisabled={!check?.isPassed || Boolean(serverError)}
            >
              {action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="The certificate you pasted will be lost."
      />
    </>
  );
};
