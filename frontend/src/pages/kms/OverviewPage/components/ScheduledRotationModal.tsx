import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import {
  TCmek,
  useGetCmekScheduledRotation,
  useUpdateCmekScheduledRotation
} from "@app/hooks/api/cmeks";

const rotationIntervalOptions = [
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "365 days" }
];

const formSchema = z
  .object({
    enableAutoRotation: z.boolean(),
    rotationIntervalDays: z.number().min(1).max(365).optional()
  })
  .refine(
    (data) => {
      if (data.enableAutoRotation && !data.rotationIntervalDays) {
        return false;
      }
      return true;
    },
    {
      message: "Rotation interval is required when auto rotation is enabled",
      path: ["rotationIntervalDays"]
    }
  );

type TFormData = z.infer<typeof formSchema>;

type Props = {
  cmek: TCmek | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const ScheduledRotationModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  const { data: scheduledRotation, isLoading } = useGetCmekScheduledRotation(cmek?.id ?? "", {
    enabled: isOpen && Boolean(cmek?.id)
  });

  const updateScheduledRotation = useUpdateCmekScheduledRotation();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      enableAutoRotation: false,
      rotationIntervalDays: 90
    }
  });

  const enableAutoRotation = watch("enableAutoRotation");

  useEffect(() => {
    if (scheduledRotation) {
      reset({
        enableAutoRotation: scheduledRotation.isAutoRotationEnabled,
        rotationIntervalDays: scheduledRotation.rotationIntervalDays ?? 90
      });
    }
  }, [scheduledRotation, reset]);

  const onSubmit = async (data: TFormData) => {
    if (!cmek) return;

    try {
      await updateScheduledRotation.mutateAsync({
        keyId: cmek.id,
        enableAutoRotation: data.enableAutoRotation,
        rotationIntervalDays: data.enableAutoRotation ? data.rotationIntervalDays : undefined
      });

      createNotification({
        type: "success",
        text: data.enableAutoRotation
          ? "Scheduled rotation enabled successfully"
          : "Scheduled rotation disabled"
      });

      onOpenChange(false);
    } catch (error) {
      console.error(error);
      createNotification({
        type: "error",
        text: "Failed to update scheduled rotation settings"
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Scheduled Key Rotation"
        subTitle={`Configure automatic rotation schedule for "${cmek?.name}"`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {scheduledRotation && (
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 text-sm">
                <div className="grid grid-cols-2 gap-2 text-mineshaft-300">
                  <span>Last rotated:</span>
                  <span className="text-mineshaft-100">
                    {formatDate(scheduledRotation.lastRotatedAt)}
                  </span>
                  {scheduledRotation.isAutoRotationEnabled && (
                    <>
                      <span>Next rotation:</span>
                      <span className="text-mineshaft-100">
                        {formatDate(scheduledRotation.nextRotationAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            <Controller
              control={control}
              name="enableAutoRotation"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Enable Automatic Rotation">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="enable-auto-rotation"
                      isChecked={value}
                      onCheckedChange={onChange}
                    />
                    <label htmlFor="enable-auto-rotation" className="text-sm text-mineshaft-300">
                      {value ? "Enabled" : "Disabled"}
                    </label>
                  </div>
                </FormControl>
              )}
            />

            {enableAutoRotation && (
              <Controller
                control={control}
                name="rotationIntervalDays"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Rotation Interval"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Select
                      value={String(value)}
                      onValueChange={(val) => onChange(Number(val))}
                      className="w-full"
                    >
                      {rotationIntervalOptions.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            )}

            <div className="mt-2 rounded-md border border-yellow-600/30 bg-yellow-600/10 p-3 text-sm text-yellow-200">
              <p>
                When automatic rotation is enabled, the key will be automatically rotated at the
                specified interval. Previous key versions are retained for decrypting existing data.
              </p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline_bg"
                colorSchema="secondary"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
                Save Settings
              </Button>
            </div>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
};
