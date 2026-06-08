import { Controller, useForm } from "react-hook-form";
import { faCopy, faInfoCircle, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { certKeyAlgorithms, isPqcAlgorithm } from "@app/hooks/api/certificates/constants";
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
    <form onSubmit={handleSubmit(handleKmipClientSubmit)}>
      <Controller
        control={control}
        name="requestMethod"
        render={({ field: { onChange, value } }) => (
          <FormControl
            label={
              <FormLabel
                label="Request Method"
                icon={
                  <Tooltip
                    content={
                      <div className="space-y-2">
                        <p>
                          <strong>Managed:</strong> Infisical generates and manages the private key
                          for you.
                        </p>
                        <p>
                          <strong>CSR:</strong> Provide your own Certificate Signing Request. Use
                          this when your device (e.g., Dell iDRAC) generates its own private key.
                        </p>
                      </div>
                    }
                  >
                    <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                  </Tooltip>
                }
              />
            }
          >
            <Select
              value={value}
              onValueChange={(val) => onChange(val as RequestMethod)}
              className="w-full"
            >
              <SelectItem value={RequestMethod.MANAGED}>Managed</SelectItem>
              <SelectItem value={RequestMethod.CSR}>Certificate Signing Request (CSR)</SelectItem>
            </Select>
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="ttl"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="TTL" isError={Boolean(error)} errorText={error?.message} isRequired>
            <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
          </FormControl>
        )}
      />

      {requestMethod === RequestMethod.MANAGED && (
        <Controller
          control={control}
          name="keyAlgorithm"
          defaultValue={CertKeyAlgorithm.RSA_2048}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Key Algorithm"
              errorText={error?.message}
              isError={Boolean(error)}
              helperText="This defines the key algorithm to use for signing the client certificate."
            >
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
              >
                {certKeyAlgorithms
                  .filter(({ value }) => !isPqcAlgorithm(value))
                  .map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
                    </SelectItem>
                  ))}
              </Select>
            </FormControl>
          )}
        />
      )}

      {requestMethod === RequestMethod.CSR && (
        <>
          <Controller
            control={control}
            name="csr"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Certificate Signing Request (CSR)"
                isRequired
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <TextArea
                  {...field}
                  spellCheck={false}
                  placeholder={
                    "-----BEGIN CERTIFICATE REQUEST-----\n" +
                    "MIIByDCCAU4CAQAwfjELMAkGA1UEBhMCVVMx...\n" +
                    "-----END CERTIFICATE REQUEST-----"
                  }
                  rows={8}
                  className="w-full font-mono text-xs"
                />
              </FormControl>
            )}
          />

          {kmipClient && (
            <div className="mt-4 rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4">
              <div className="mb-3 flex items-center text-sm font-medium text-mineshaft-200">
                <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
                Certificate Subject Values
              </div>
              <p className="mb-3 text-xs text-mineshaft-300">
                The signed certificate will use these fixed values for CN and OU. If your device
                requires you to specify subject values when generating the CSR, use the values
                below.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded bg-mineshaft-600 px-3 py-2">
                  <div>
                    <div className="text-xs text-mineshaft-400">
                      CN (Common Name) = KMIP Client ID
                    </div>
                    <div className="font-mono text-sm text-mineshaft-100">{kmipClient.id}</div>
                  </div>
                  <IconButton
                    ariaLabel="Copy Client ID"
                    variant="plain"
                    size="sm"
                    onClick={() => handleCopyToClipboard(kmipClient.id, "Client ID")}
                  >
                    <FontAwesomeIcon icon={faCopy} />
                  </IconButton>
                </div>
                <div className="flex items-center justify-between rounded bg-mineshaft-600 px-3 py-2">
                  <div>
                    <div className="text-xs text-mineshaft-400">
                      OU (Organizational Unit) = Project ID
                    </div>
                    <div className="font-mono text-sm text-mineshaft-100">
                      {kmipClient.projectId}
                    </div>
                  </div>
                  <IconButton
                    ariaLabel="Copy Project ID"
                    variant="plain"
                    size="sm"
                    onClick={() => handleCopyToClipboard(kmipClient.projectId, "Project ID")}
                  >
                    <FontAwesomeIcon icon={faCopy} />
                  </IconButton>
                </div>
              </div>
              <p className="mt-3 text-xs text-mineshaft-400">
                Note: Any O (Organization), L (Locality), ST (State), or C (Country) values in your
                CSR will be included in the certificate.
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {requestMethod === RequestMethod.CSR ? "Sign Certificate" : "Generate Certificate"}
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="KMIP client certificate">
        <KmipClientCertificateForm
          onComplete={() => onOpenChange(false)}
          displayNewClientCertificate={displayNewClientCertificate}
          kmipClient={kmipClient}
        />
      </ModalContent>
    </Modal>
  );
};
