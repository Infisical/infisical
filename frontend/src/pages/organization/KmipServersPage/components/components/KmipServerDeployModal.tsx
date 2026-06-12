import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
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
import { useOrganization } from "@app/context";
import {
  certKeyAlgorithms,
  certKeyAlgorithmToNameMap,
  isPqcAlgorithm
} from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useCreateKmipServer } from "@app/hooks/api/kmipServers";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  hostnamesOrIps: z
    .string()
    .trim()
    .min(1, "At least one hostname or IP is required")
    .max(4096, "Hostnames or IPs must be at most 4096 characters"),
  ttl: z.string().trim().min(1, "TTL is required").max(64, "TTL is too long"),
  keyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const KmipServerDeployModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const navigate = useNavigate();
  const { mutateAsync: createKmipServer } = useCreateKmipServer();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      hostnamesOrIps: "",
      ttl: "1y",
      keyAlgorithm: CertKeyAlgorithm.RSA_2048
    }
  });

  const onSubmit = async (form: FormData) => {
    try {
      const kmipServer = await createKmipServer({
        name: form.name,
        hostnamesOrIps: form.hostnamesOrIps,
        ttl: form.ttl,
        keyAlgorithm: form.keyAlgorithm,
        authMethod: { method: "token" }
      });

      onOpenChange(false);
      navigate({
        to: "/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId",
        params: { orgId, kmipServerId: kmipServer.id }
      });
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.message || "Failed to create KMIP server"
      });
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        className="max-w-lg"
        title="Create KMIP Server"
        subTitle="Create a new KMIP server. You can generate an enrollment token and deploy it from the KMIP server detail page."
        bodyClassName="overflow-visible"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="my-kmip-server" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="hostnamesOrIps"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Hostnames or IPs"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Comma-separated list of the hostnames or IPs that KMIP clients will use to reach this server. These become the server certificate's subject alternative names."
              >
                <Input {...field} placeholder="kmip.example.com, 10.0.0.5" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Certificate TTL"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Validity period of the server certificate, e.g. 2 days, 1d, 2h, 1y."
              >
                <Input {...field} placeholder="1y" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="keyAlgorithm"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Key Algorithm"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Key algorithm used to sign the server certificate."
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {certKeyAlgorithms
                    .filter(({ value }) => !isPqcAlgorithm(value))
                    .map(({ value }) => (
                      <SelectItem value={String(value || "")} key={value}>
                        {certKeyAlgorithmToNameMap[value]}
                      </SelectItem>
                    ))}
                </Select>
              </FormControl>
            )}
          />
          <div className="mt-6 flex items-center gap-2">
            <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting} size="sm">
              Create KMIP Server
            </Button>
            <ModalClose asChild>
              <Button size="sm" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
