import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectClear,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { approvalPolicyQuery, ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { TSigner, useUpdateSigner } from "@app/hooks/api/signers";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signer: TSigner;
  projectId: string;
};

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256).optional().or(z.literal("")),
  approvalPolicyId: z.string().uuid().optional().or(z.literal(""))
});

type FormData = z.infer<typeof formSchema>;

export const EditSignerModal = ({ isOpen, onOpenChange, signer, projectId }: Props) => {
  const updateSigner = useUpdateSigner();

  const { data: policies = [], isPending: isPoliciesLoading } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.CertCodeSigning,
      projectId
    })
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: signer.name,
      description: signer.description ?? "",
      approvalPolicyId: signer.approvalPolicyId ?? ""
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset({
        name: signer.name,
        description: signer.description ?? "",
        approvalPolicyId: signer.approvalPolicyId ?? ""
      });
    }
    onOpenChange(open);
  };

  const onSubmit = async (data: FormData) => {
    await updateSigner.mutateAsync({
      signerId: signer.id,
      name: data.name,
      description: data.description || null,
      approvalPolicyId: data.approvalPolicyId || null
    });
    handleOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalContent title="Edit Signer">
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
              <FormControl label="Description" isError={Boolean(error)} errorText={error?.message}>
                <TextArea {...field} placeholder="Optional description" rows={2} />
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
                helperText="Optional. Without a policy, signing is allowed without approval."
              >
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  className="w-full"
                  isLoading={isPoliciesLoading}
                  placeholder="None (no approval required)"
                >
                  <SelectClear selectValue={field.value ?? ""} onClear={() => field.onChange("")}>
                    None (no approval required)
                  </SelectClear>
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
            <Button variant="outline_bg" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
