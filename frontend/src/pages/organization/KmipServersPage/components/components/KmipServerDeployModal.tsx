import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useScopeVariant } from "@app/hooks";
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
  keyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
});

const keyAlgorithmOptions = certKeyAlgorithms.filter(({ value }) => !isPqcAlgorithm(value));

export const KmipServerDeployModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const navigate = useNavigate();
  const scopeVariant = useScopeVariant();
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
      keyAlgorithm: CertKeyAlgorithm.RSA_2048
    }
  });

  const onSubmit = async (form: FormData) => {
    try {
      const kmipServer = await createKmipServer({
        name: form.name,
        hostnamesOrIps: form.hostnamesOrIps,
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create KMIP Server</DialogTitle>
          <DialogDescription>
            Create a new KMIP server. You can generate an enrollment token and deploy it from the
            KMIP server detail page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="kmip-server-name">
                  Name
                  <span aria-hidden className="text-danger">
                    *
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  id="kmip-server-name"
                  placeholder="my-kmip-server"
                  aria-required
                  isError={Boolean(error)}
                  autoFocus
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="hostnamesOrIps"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="kmip-server-hostnames">
                  Hostnames or IPs
                  <span aria-hidden className="text-danger">
                    *
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  id="kmip-server-hostnames"
                  placeholder="kmip.example.com, 10.0.0.5"
                  aria-required
                  isError={Boolean(error)}
                />
                <FieldDescription>
                  Comma-separated list of the hostnames or IPs that KMIP clients will use to reach
                  this server. These become the server certificate&apos;s subject alternative names.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="keyAlgorithm"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="kmip-server-key-algorithm">Key algorithm</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger
                    id="kmip-server-key-algorithm"
                    isError={Boolean(error)}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {keyAlgorithmOptions.map(({ value: algorithm }) => (
                      <SelectItem value={algorithm} key={algorithm}>
                        {certKeyAlgorithmToNameMap[algorithm]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Key algorithm used to sign the server certificate.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant={scopeVariant}
              type="submit"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Create KMIP Server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};
