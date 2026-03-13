import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import {
  approvalPolicyQuery,
  ApprovalPolicyType
} from "@app/hooks/api/approvalPolicies";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";
import { useCreateSigner } from "@app/hooks/api/signers";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
};

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Name must contain only lowercase letters, numbers, and hyphens"),
  description: z.string().trim().max(256).optional(),
  certificateId: z.string().uuid("Certificate is required"),
  approvalPolicyId: z.string().uuid("Approval policy is required")
});

type FormData = z.infer<typeof formSchema>;

type CertOption = {
  label: string;
  value: string;
};

export const CreateSignerModal = ({ isOpen, onOpenChange, projectId }: Props) => {
  const createSigner = useCreateSigner();

  const { data: certificatesData, isPending: isCertsLoading } = useListWorkspaceCertificates({
    projectId,
    offset: 0,
    limit: 100,
    status: "active",
    extendedKeyUsage: "codeSigning"
  });

  const { data: policies = [], isPending: isPoliciesLoading } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.CertManagerCodeSigning,
      projectId
    })
  );

  const certOptions: CertOption[] = useMemo(() => {
    const certs = certificatesData?.certificates ?? [];
    return certs.map((cert) => {
      const display = cert.friendlyName || cert.commonName || cert.id;
      const subtitle = cert.altNames ? ` (${cert.altNames})` : "";
      return {
        label: `${display}${subtitle}`,
        value: cert.id
      };
    });
  }, [certificatesData?.certificates]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      certificateId: "",
      approvalPolicyId: ""
    }
  });

  const onSubmit = async (data: FormData) => {
    await createSigner.mutateAsync({
      projectId,
      ...data
    });
    handleOpenChange(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalContent title="Create Signer">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            name="name"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="my-code-signer" />
              </FormControl>
            )}
          />
          <Controller
            name="description"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Description"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <TextArea {...field} placeholder="Optional description" rows={2} />
              </FormControl>
            )}
          />
          <Controller
            name="certificateId"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Certificate"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Only active certificates with the codeSigning extended key usage are shown"
              >
                <FilterableSelect<CertOption>
                  isLoading={isCertsLoading}
                  options={certOptions}
                  value={certOptions.find((opt) => opt.value === field.value) ?? null}
                  onChange={(selected) => {
                    const option = selected as CertOption | null;
                    field.onChange(option?.value ?? "");
                  }}
                  placeholder="Search by common name or SAN..."
                  noOptionsMessage={() => "No certificates with codeSigning EKU found"}
                  maxMenuHeight={200}
                />
              </FormControl>
            )}
          />
          <Controller
            name="approvalPolicyId"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Approval Policy"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Must be a code signing approval policy"
              >
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  className="w-full"
                  isLoading={isPoliciesLoading}
                  placeholder="Select an approval policy..."
                >
                  {policies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline_bg"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Create
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
