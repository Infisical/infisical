import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateKmipClient, useUpdateKmipClient } from "@app/hooks/api/kmip";
import { KmipPermission, TKmipClient } from "@app/hooks/api/kmip/types";

const KMIP_PERMISSIONS_OPTIONS = [
  { value: KmipPermission.Check, label: "Check" },
  { value: KmipPermission.Create, label: "Create" },
  { value: KmipPermission.Get, label: "Get" },
  { value: KmipPermission.Locate, label: "Locate" },
  { value: KmipPermission.Destroy, label: "Destroy" },
  { value: KmipPermission.Activate, label: "Activate" },
  { value: KmipPermission.Revoke, label: "Revoke" },
  { value: KmipPermission.GetAttributes, label: "Get Attributes" },
  { value: KmipPermission.Register, label: "Register" }
] as const;

const formSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().max(500).optional(),
  permissions: z.object({
    [KmipPermission.Check]: z.boolean().optional(),
    [KmipPermission.Create]: z.boolean().optional(),
    [KmipPermission.Get]: z.boolean().optional(),
    [KmipPermission.Locate]: z.boolean().optional(),
    [KmipPermission.Destroy]: z.boolean().optional(),
    [KmipPermission.Activate]: z.boolean().optional(),
    [KmipPermission.GetAttributes]: z.boolean().optional(),
    [KmipPermission.Revoke]: z.boolean().optional(),
    [KmipPermission.Register]: z.boolean().optional()
  })
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmipClient?: TKmipClient | null;
};

type FormProps = Pick<Props, "kmipClient"> & {
  onComplete: () => void;
};

const KmipClientForm = ({ onComplete, kmipClient }: FormProps) => {
  const createKmipClient = useCreateKmipClient();
  const updateKmipClient = useUpdateKmipClient();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace.id;
  const isUpdate = !!kmipClient;

  const {
    control,
    handleSubmit,
    register,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: kmipClient?.name,
      description: kmipClient?.description,
      permissions: Object.fromEntries((kmipClient?.permissions || []).map((name) => [name, true]))
    }
  });

  const handleKmipClientSubmit = async ({ permissions, name, description }: FormData) => {
    const mutation = isUpdate
      ? updateKmipClient.mutateAsync({
          id: kmipClient.id,
          projectId,
          name,
          description,
          permissions: Object.entries(permissions)
            .filter(([, value]) => value)
            .map(([key]) => key as KmipPermission)
        })
      : createKmipClient.mutateAsync({
          projectId,
          name,
          description,
          permissions: Object.entries(permissions)
            .filter(([, value]) => value)
            .map(([key]) => key as KmipPermission)
        });

    try {
      await mutation;
      createNotification({
        text: `Successfully ${isUpdate ? "updated" : "added"} KMIP client`,
        type: "success"
      });
      onComplete();
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${isUpdate ? "update" : "add"} KMIP client`,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleKmipClientSubmit)}>
      <FormControl
        errorText={errors.name?.message}
        isError={Boolean(errors.name?.message)}
        label="Name"
      >
        <Input autoFocus placeholder="My KMIP Client" {...register("name")} />
      </FormControl>
      <FormControl
        label="Description (optional)"
        errorText={errors.description?.message}
        isError={Boolean(errors.description?.message)}
      >
        <TextArea
          className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
          {...register("description")}
        />
      </FormControl>
      <Controller
        control={control}
        name="permissions"
        render={({ field: { onChange, value }, fieldState: { error } }) => {
          return (
            <FormControl label="Permissions" errorText={error?.message} isError={Boolean(error)}>
              <div className="mb-7 mt-2 grid grid-cols-2 gap-2">
                {KMIP_PERMISSIONS_OPTIONS.map(({ label, value: optionValue }) => {
                  return (
                    <Checkbox
                      id={optionValue}
                      key={optionValue}
                      isChecked={value[optionValue]}
                      onCheckedChange={(state) => {
                        onChange({
                          ...value,
                          [optionValue]: state
                        });
                      }}
                    >
                      {label}
                    </Checkbox>
                  );
                })}
              </div>
            </FormControl>
          );
        }}
      />
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? "Update" : "Add"} KMIP client
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

export const KmipClientModal = ({ isOpen, onOpenChange, kmipClient }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title={`${kmipClient ? "Update" : "Add"} KMIP Client`}>
        <KmipClientForm onComplete={() => onOpenChange(false)} kmipClient={kmipClient} />
      </ModalContent>
    </Modal>
  );
};
