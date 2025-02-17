import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { certKeyAlgorithms } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useGenerateKmipClientCertificate } from "@app/hooks/api/kmip";
import { KmipClientCertificate, TKmipClient } from "@app/hooks/api/kmip/types";

const formSchema = z.object({
  keyAlgorithm: z.nativeEnum(CertKeyAlgorithm),
  ttl: z.string()
});

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
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });

  const handleKmipClientSubmit = async (payload: FormData) => {
    if (!kmipClient) {
      return;
    }

    const certificate = await createKmipClientCertificate({
      ...payload,
      clientId: kmipClient?.id
    });

    createNotification({
      text: "Successfully created KMIP client certificate",
      type: "success"
    });

    displayNewClientCertificate(certificate);
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit(handleKmipClientSubmit)}>
      <Controller
        control={control}
        name="ttl"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="TTL" isError={Boolean(error)} errorText={error?.message} isRequired>
            <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
          </FormControl>
        )}
      />
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
              {certKeyAlgorithms.map(({ label, value }) => (
                <SelectItem value={String(value || "")} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <div className="mt-8 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Generate Client Certificate
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
      <ModalContent title="Generate KMIP client certificate">
        <KmipClientCertificateForm
          onComplete={() => onOpenChange(false)}
          displayNewClientCertificate={displayNewClientCertificate}
          kmipClient={kmipClient}
        />
      </ModalContent>
    </Modal>
  );
};
