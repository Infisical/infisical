import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { SECRET_SCANNING_FINDING_STATUS_ICON_MAP } from "@app/helpers/secretScanningV2";
import {
  SecretScanningFindingStatus,
  TSecretScanningFinding,
  useUpdateMultipleSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

type Props = {
  findings?: TSecretScanningFinding[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: () => void;
};

const FormSchema = z.object({
  remarks: z.string().max(256, "Cannot exceed 256 characters").optional(),
  status: z.nativeEnum(SecretScanningFindingStatus).optional()
});

type FormType = z.infer<typeof FormSchema>;

type ContentProps = {
  findings: TSecretScanningFinding[];
  onComplete: () => void;
};

const Content = ({ findings, onComplete }: ContentProps) => {
  const updateMultipleFindings = useUpdateMultipleSecretScanningFinding();

  const single = findings.length === 1;

  const { handleSubmit, control } = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      status: single ? findings[0].status : undefined,
      remarks: single ? findings[0].remarks : undefined
    }
  });

  const onSubmit = async (data: FormType) => {
    if (!data.status) return;

    try {
      if (findings.length > 1) {
        await updateMultipleFindings.mutateAsync(
          findings.map((f) => ({
            ...data,
            status: data.status!,
            findingId: f.id,
            projectId: f.projectId
          }))
        );
      } else {
        await updateMultipleFindings.mutateAsync([
          {
            ...data,
            status: data.status,
            findingId: findings[0].id,
            projectId: findings[0].projectId
          }
        ]);
      }

      createNotification({
        type: "success",
        text: `Finding status${single ? "" : "es"} successfully updated`
      });

      onComplete();
    } catch {
      createNotification({
        type: "error",
        text: `Failed to update finding status${single ? "" : "es"}`
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="status"
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          return (
            <FormControl label="Status" isError={Boolean(error)} errorText={error?.message}>
              <Select
                value={value}
                placeholder="Select status..."
                onValueChange={onChange}
                className="w-full border border-mineshaft-500 capitalize"
                position="popper"
                dropdownContainerClassName="max-w-none"
                icon={value ? SECRET_SCANNING_FINDING_STATUS_ICON_MAP[value].icon : undefined}
                iconClassName={
                  value ? SECRET_SCANNING_FINDING_STATUS_ICON_MAP[value].className : undefined
                }
              >
                {Object.values(SecretScanningFindingStatus).map((status) => {
                  return (
                    <SelectItem className="capitalize" value={status} key={status}>
                      {status.replace("-", " ")}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          );
        }}
      />
      <Controller
        control={control}
        name="remarks"
        render={({ field, fieldState: { error } }) => {
          return (
            <FormControl label="Remarks" isError={Boolean(error)} errorText={error?.message}>
              <TextArea className="h-40 !resize-none" {...field} />
            </FormControl>
          );
        }}
      />
      <div className="flex w-full flex-row-reverse justify-between gap-4 pt-4">
        <Button
          type="submit"
          isLoading={updateMultipleFindings.isPending}
          isDisabled={updateMultipleFindings.isPending}
          colorSchema="secondary"
        >
          Update Status
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary">Cancel</Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const SecretScanningUpdateFindingModal = ({
  findings,
  isOpen,
  onOpenChange,
  onComplete
}: Props) => {
  if (!findings?.length) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title={`Update Finding${findings.length === 1 ? "" : "s"}`}
        subTitle="Update the status or leave remarks"
      >
        <Content
          findings={findings}
          onComplete={() => {
            onOpenChange(false);
            if (onComplete) onComplete();
          }}
        />
      </ModalContent>
    </Modal>
  );
};
