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
  useUpdateSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

type Props = {
  finding?: TSecretScanningFinding;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const FormSchema = z.object({
  remarks: z.string().optional(),
  status: z.nativeEnum(SecretScanningFindingStatus)
});

type FormType = z.infer<typeof FormSchema>;

type ContentProps = {
  finding: TSecretScanningFinding;
  onComplete: () => void;
};

const Content = ({ finding, onComplete }: ContentProps) => {
  const updateFinding = useUpdateSecretScanningFinding();

  const { handleSubmit, control } = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      status: finding.status,
      remarks: finding.remarks ?? ""
    }
  });

  const onSubmit = async (data: FormType) => {
    try {
      await updateFinding.mutateAsync({
        ...data,
        findingId: finding.id,
        projectId: finding.projectId
      });

      createNotification({
        type: "success",
        text: "Finding status successfully updated"
      });

      onComplete();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to update Finding status"
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
                onValueChange={onChange}
                className="w-full border border-mineshaft-500 capitalize"
                position="popper"
                dropdownContainerClassName="max-w-none"
                icon={SECRET_SCANNING_FINDING_STATUS_ICON_MAP[value].icon}
                iconClassName={SECRET_SCANNING_FINDING_STATUS_ICON_MAP[value].className}
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
          isLoading={updateFinding.isPending}
          isDisabled={updateFinding.isPending}
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

export const SecretScanningUpdateFindingModal = ({ finding, isOpen, onOpenChange }: Props) => {
  if (!finding) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Resolve Finding" subTitle="Mark this finding as resolved">
        <Content finding={finding} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
