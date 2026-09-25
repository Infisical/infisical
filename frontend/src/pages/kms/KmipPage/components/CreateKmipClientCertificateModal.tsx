import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelpIcon, CopyIcon, InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  certKeyAlgorithms,
  certKeyAlgorithmToNameMap,
  isPqcAlgorithm
} from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useGenerateKmipClientCertificate } from "@app/hooks/api/kmip";
import { KmipClientCertificate, TKmipClient } from "@app/hooks/api/kmip/types";

enum RequestMethod {
  MANAGED = "managed",
  CSR = "csr"
}

const baseSchema = z.object({
  ttl: z.string().min(1, "TTL is required")
});

const csrSchema = baseSchema.extend({
  requestMethod: z.literal(RequestMethod.CSR),
  csr: z.string().min(1, "CSR is required")
});

const managedSchema = baseSchema.extend({
  requestMethod: z.literal(RequestMethod.MANAGED),
  keyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
});

const formSchema = z.discriminatedUnion("requestMethod", [csrSchema, managedSchema]);

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmipClient?: TKmipClient | null;
  displayNewClientCertificate: (certificate: KmipClientCertificate) => void;
};

type FormProps = Pick<Props, "kmipClient" | "displayNewClientCertificate"> & {
  onComplete: () => void;
};

const KmipClientCertificateForm = ({
  displayNewClientCertificate,
  kmipClient,
  onComplete
}: FormProps) => {
  const { mutateAsync: createKmipClientCertificate } = useGenerateKmipClientCertificate();

  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      requestMethod: RequestMethod.MANAGED,
      keyAlgorithm: CertKeyAlgorithm.RSA_2048,
      ttl: ""
    }
  });

  const requestMethod = watch("requestMethod");

  const handleKmipClientSubmit = async (payload: FormData) => {
    if (!kmipClient) {
      return;
    }

    try {
      const certificate = await createKmipClientCertificate({
        ttl: payload.ttl,
        clientId: kmipClient.id,
        ...(payload.requestMethod === RequestMethod.CSR
          ? { csr: payload.csr }
          : { keyAlgorithm: payload.keyAlgorithm })
      });

      createNotification({
        text: `Successfully ${payload.requestMethod === RequestMethod.CSR ? "signed" : "generated"} KMIP client certificate`,
        type: "success"
      });

      displayNewClientCertificate(certificate);
      onComplete();
    } catch (error) {
      createNotification({
        text: `Failed to create certificate: ${(error as Error)?.message || "Unknown error"}`,
        type: "error"
      });
    }
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    createNotification({
      text: `${label} copied to clipboard`,
      type: "success"
    });
  };

  return (
    <form onSubmit={handleSubmit(handleKmipClientSubmit)} className="flex min-h-0 flex-1 flex-col">
      <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        <Controller
          control={control}
          name="requestMethod"
          render={({ field: { onChange, value } }) => (
            <Field>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor="kmip-cert-method">Request Method</FieldLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="About request methods">
                      <CircleHelpIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-72 space-y-2">
                      <p>
                        <strong>Managed:</strong> Infisical generates and manages the private key
                        for you.
                      </p>
                      <p>
                        <strong>CSR:</strong> Provide your own Certificate Signing Request. Use this
                        when your device (e.g., Dell iDRAC) generates its own private key.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={value} onValueChange={(val) => onChange(val as RequestMethod)}>
                <SelectTrigger id="kmip-cert-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RequestMethod.MANAGED}>Managed</SelectItem>
                  <SelectItem value={RequestMethod.CSR}>
                    Certificate Signing Request (CSR)
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="ttl"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="kmip-cert-ttl">
                TTL{" "}
                <span aria-hidden className="text-danger">
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id="kmip-cert-ttl"
                placeholder="2 days, 1d, 2h, 1y, ..."
                aria-required
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />

        {requestMethod === RequestMethod.MANAGED && (
          <Controller
            control={control}
            name="keyAlgorithm"
            defaultValue={CertKeyAlgorithm.RSA_2048}
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="kmip-cert-algorithm">Key Algorithm</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger
                    id="kmip-cert-algorithm"
                    className="w-full"
                    isError={Boolean(error)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {certKeyAlgorithms
                      .filter(({ value: algorithm }) => !isPqcAlgorithm(algorithm))
                      .map(({ label, value: algorithm }) => (
                        <SelectItem value={String(algorithm || "")} key={label}>
                          {certKeyAlgorithmToNameMap[algorithm] || label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  This defines the key algorithm used to sign the client certificate.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        )}

        {requestMethod === RequestMethod.CSR && (
          <>
            <Controller
              control={control}
              name="csr"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="kmip-cert-csr">
                    Certificate Signing Request (CSR){" "}
                    <span aria-hidden className="text-danger">
                      *
                    </span>
                  </FieldLabel>
                  <TextArea
                    {...field}
                    id="kmip-cert-csr"
                    aria-required
                    isError={Boolean(error)}
                    spellCheck={false}
                    placeholder={
                      "-----BEGIN CERTIFICATE REQUEST-----\n" +
                      "MIIByDCCAU4CAQAwfjELMAkGA1UEBhMCVVMx...\n" +
                      "-----END CERTIFICATE REQUEST-----"
                    }
                    rows={8}
                    className="font-mono"
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            {kmipClient && (
              <div className="rounded-md border border-border bg-container p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <InfoIcon className="size-4" />
                  Certificate Subject Values
                </div>
                <p className="mb-3 text-xs text-label">
                  The signed certificate will use these fixed values for CN and OU. If your device
                  requires you to specify subject values when generating the CSR, use the values
                  below.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded bg-card px-3 py-2">
                    <div>
                      <div className="text-xs text-muted">CN (Common Name) = KMIP Client ID</div>
                      <div className="font-mono text-sm break-all text-foreground">
                        {kmipClient.id}
                      </div>
                    </div>
                    <IconButton
                      aria-label="Copy Client ID"
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => handleCopyToClipboard(kmipClient.id, "Client ID")}
                    >
                      <CopyIcon />
                    </IconButton>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded bg-card px-3 py-2">
                    <div>
                      <div className="text-xs text-muted">
                        OU (Organizational Unit) = Project ID
                      </div>
                      <div className="font-mono text-sm break-all text-foreground">
                        {kmipClient.projectId}
                      </div>
                    </div>
                    <IconButton
                      aria-label="Copy Project ID"
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => handleCopyToClipboard(kmipClient.projectId, "Project ID")}
                    >
                      <CopyIcon />
                    </IconButton>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Note: Any O (Organization), L (Locality), ST (State), or C (Country) values in
                  your CSR will be included in the certificate.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <SheetFooter className="justify-end border-t">
        <SheetClose asChild>
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </SheetClose>
        <Button variant="project" type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
          {requestMethod === RequestMethod.CSR ? "Sign Certificate" : "Generate Certificate"}
        </Button>
      </SheetFooter>
    </form>
  );
};

export const CreateKmipClientCertificateModal = ({
  isOpen,
  onOpenChange,
  kmipClient,
  displayNewClientCertificate
}: Props) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={(event) => {
          const ttlInput = (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>(
            "#kmip-cert-ttl"
          );
          if (ttlInput) {
            event.preventDefault();
            ttlInput.focus();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>KMIP Client Certificate</SheetTitle>
          <SheetDescription>
            Generate a private key or sign a certificate signing request for this client.
          </SheetDescription>
        </SheetHeader>
        {isOpen && (
          <KmipClientCertificateForm
            key={kmipClient?.id}
            onComplete={() => onOpenChange(false)}
            displayNewClientCertificate={displayNewClientCertificate}
            kmipClient={kmipClient}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
