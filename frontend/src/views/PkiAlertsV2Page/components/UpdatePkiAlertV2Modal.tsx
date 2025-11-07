import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  TextArea
} from "@app/components/v2";
import {
  PkiAlertChannelTypeV2,
  PkiAlertEventTypeV2,
  PkiFilterFieldV2,
  PkiFilterOperatorV2,
  TPkiAlertChannelV2,
  TPkiFilterRuleV2,
  TUpdatePkiAlertV2,
  updatePkiAlertV2Schema,
  useGetPkiAlertV2ById,
  useUpdatePkiAlertV2
} from "@app/hooks/api/pkiAlertsV2";

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  alertId?: string;
}

type TFormData = Omit<TUpdatePkiAlertV2, "alertId">;

export const UpdatePkiAlertV2Modal = ({ isOpen, onOpenChange, alertId }: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, reset, watch, setValue } = useForm<TFormData>({
    resolver: zodResolver(updatePkiAlertV2Schema)
  });

  const { data: alert, isLoading } = useGetPkiAlertV2ById(
    { alertId: alertId || "" },
    { enabled: !!alertId && isOpen }
  );

  const { mutateAsync: updateAlert } = useUpdatePkiAlertV2();

  const watchedFilters = watch("filters");
  const watchedChannels = watch("channels");

  useEffect(() => {
    if (alert) {
      reset({
        name: alert.name,
        description: alert.description || "",
        eventType: alert.eventType,
        alertBefore: alert.alertBefore || "",
        filters: alert.filters,
        enabled: alert.enabled,
        channels: alert.channels.map(({ id, createdAt, updatedAt, ...channel }) => channel)
      });
    }
  }, [alert, reset]);

  const addFilter = () => {
    const currentFilters = watchedFilters || [];
    setValue("filters", [
      ...currentFilters,
      {
        field: PkiFilterFieldV2.COMMON_NAME,
        operator: PkiFilterOperatorV2.CONTAINS,
        value: ""
      }
    ]);
  };

  const removeFilter = (index: number) => {
    const currentFilters = watchedFilters || [];
    setValue(
      "filters",
      currentFilters.filter((_, i) => i !== index)
    );
  };

  const updateFilter = (index: number, updatedFilter: Partial<TPkiFilterRuleV2>) => {
    const currentFilters = [...(watchedFilters || [])];
    currentFilters[index] = { ...currentFilters[index], ...updatedFilter };
    setValue("filters", currentFilters);
  };

  const addChannel = () => {
    const currentChannels = watchedChannels || [];
    setValue("channels", [
      ...currentChannels,
      {
        channelType: PkiAlertChannelTypeV2.EMAIL,
        config: { recipients: [] },
        enabled: true
      }
    ]);
  };

  const removeChannel = (index: number) => {
    const currentChannels = watchedChannels || [];
    if (currentChannels.length > 1) {
      setValue(
        "channels",
        currentChannels.filter((_, i) => i !== index)
      );
    }
  };

  const updateChannel = (
    index: number,
    updatedChannel: Partial<Omit<TPkiAlertChannelV2, "id" | "createdAt" | "updatedAt">>
  ) => {
    const currentChannels = [...(watchedChannels || [])];
    currentChannels[index] = { ...currentChannels[index], ...updatedChannel };
    setValue("channels", currentChannels);
  };

  const onSubmit = async (data: TFormData) => {
    if (!alertId) return;

    setIsSubmitting(true);
    try {
      await updateAlert({
        alertId,
        ...data
      });

      createNotification({
        text: "PKI alert updated successfully",
        type: "success"
      });

      onOpenChange(false);
    } catch {
      createNotification({
        text: "Failed to update PKI alert",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldOperators = (field: PkiFilterFieldV2) => {
    if (field === PkiFilterFieldV2.INCLUDE_CAS) {
      return [PkiFilterOperatorV2.EQUALS];
    }
    return Object.values(PkiFilterOperatorV2);
  };

  const isValueBoolean = (field: PkiFilterFieldV2) => {
    return field === PkiFilterFieldV2.INCLUDE_CAS;
  };

  const canOperatorTakeArray = (operator: PkiFilterOperatorV2) => {
    return operator === PkiFilterOperatorV2.MATCHES;
  };

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent title="Update Certificate Alert" className="max-w-4xl">
          <div className="space-y-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Update Certificate Alert" className="max-w-4xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Alert Name" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="certificate-expiration-alert" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="eventType"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Event Type" isError={Boolean(error)} errorText={error?.message}>
                  <Select value={field.value} onValueChange={(value) => field.onChange(value)}>
                    <SelectItem value={PkiAlertEventTypeV2.EXPIRATION}>
                      Certificate Expiration
                    </SelectItem>
                    <SelectItem value={PkiAlertEventTypeV2.RENEWAL}>Certificate Renewal</SelectItem>
                    <SelectItem value={PkiAlertEventTypeV2.ISSUANCE}>
                      Certificate Issuance
                    </SelectItem>
                    <SelectItem value={PkiAlertEventTypeV2.REVOCATION}>
                      Certificate Revocation
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          </div>

          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Description (Optional)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <TextArea {...field} placeholder="Alert description..." rows={2} />
              </FormControl>
            )}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Controller
              control={control}
              name="alertBefore"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Alert Before (for expiration)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  helperText="Format: number + unit (d=days, w=weeks, m=months, y=years). Example: 30d"
                >
                  <Input {...field} placeholder="30d" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <FormControl label="Status">
                  <div className="mt-2 flex items-center space-x-2">
                    <Switch
                      id="alert-enabled-update"
                      isChecked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <span className="text-sm text-gray-300">
                      {field.value ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </FormControl>
              )}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <FormLabel label="Certificate Filter Rules" />
              <Button
                type="button"
                variant="outline_bg"
                size="sm"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={addFilter}
              >
                Add Filter
              </Button>
            </div>

            {watchedFilters?.map((filter, index) => (
              <div
                key={`filter-${filter.field}-${filter.operator}-${String(filter.value)}`}
                className="space-y-3 rounded-lg border border-gray-600 p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-200">Filter Rule #{index + 1}</h4>
                  <IconButton
                    size="sm"
                    variant="plain"
                    colorSchema="danger"
                    ariaLabel="Remove filter"
                    onClick={() => removeFilter(index)}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FormControl label="Field">
                    <Select
                      value={filter.field}
                      onValueChange={(value) =>
                        updateFilter(index, {
                          field: value as PkiFilterFieldV2,
                          operator:
                            value === PkiFilterFieldV2.INCLUDE_CAS
                              ? PkiFilterOperatorV2.EQUALS
                              : filter.operator,
                          value: isValueBoolean(value as PkiFilterFieldV2) ? false : ""
                        })
                      }
                    >
                      <SelectItem value={PkiFilterFieldV2.COMMON_NAME}>Common Name</SelectItem>
                      <SelectItem value={PkiFilterFieldV2.PROFILE_NAME}>Profile Name</SelectItem>
                      <SelectItem value={PkiFilterFieldV2.SAN}>
                        Subject Alternative Names
                      </SelectItem>
                      <SelectItem value={PkiFilterFieldV2.INCLUDE_CAS}>
                        Include Certificate Authorities
                      </SelectItem>
                    </Select>
                  </FormControl>

                  <FormControl label="Operator">
                    <Select
                      value={filter.operator}
                      onValueChange={(value) =>
                        updateFilter(index, { operator: value as PkiFilterOperatorV2 })
                      }
                    >
                      {getFieldOperators(filter.field).map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {operator.replace("_", " ").toUpperCase()}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl label="Value">
                    {isValueBoolean(filter.field) ? (
                      <Select
                        value={String(filter.value)}
                        onValueChange={(value) => updateFilter(index, { value: value === "true" })}
                      >
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </Select>
                    ) : (
                      <Input
                        value={
                          Array.isArray(filter.value)
                            ? filter.value.join(", ")
                            : String(filter.value)
                        }
                        onChange={(e) => {
                          const { value } = e.target;
                          const finalValue =
                            canOperatorTakeArray(filter.operator) && value.includes(",")
                              ? value
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean)
                              : value;
                          updateFilter(index, { value: finalValue });
                        }}
                        placeholder={
                          canOperatorTakeArray(filter.operator)
                            ? "example.com, test.com"
                            : "example.com"
                        }
                      />
                    )}
                  </FormControl>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <FormLabel label="Notification Channels" />
              <Button
                type="button"
                variant="outline_bg"
                size="sm"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={addChannel}
              >
                Add Channel
              </Button>
            </div>

            {watchedChannels?.map((channel, index) => (
              <div
                key={`channel-${channel.channelType}-${JSON.stringify(channel.config)}`}
                className="space-y-3 rounded-lg border border-gray-600 p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-200">Channel #{index + 1}</h4>
                  {watchedChannels.length > 1 && (
                    <IconButton
                      size="sm"
                      variant="plain"
                      colorSchema="danger"
                      ariaLabel="Remove channel"
                      onClick={() => removeChannel(index)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormControl label="Channel Type">
                    <Select
                      value={channel.channelType}
                      onValueChange={(value) =>
                        updateChannel(index, {
                          channelType: value as PkiAlertChannelTypeV2,
                          config: { recipients: [] }
                        })
                      }
                    >
                      <SelectItem value={PkiAlertChannelTypeV2.EMAIL}>Email</SelectItem>
                    </Select>
                  </FormControl>

                  <FormControl label="Status">
                    <div className="mt-2 flex items-center space-x-2">
                      <Switch
                        id={`channel-enabled-update-${index}`}
                        isChecked={channel.enabled}
                        onCheckedChange={(enabled) => updateChannel(index, { enabled })}
                      />
                      <span className="text-sm text-gray-300">
                        {channel.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </FormControl>
                </div>

                <FormControl label="Email Recipients">
                  <Input
                    value={(channel.config as any)?.recipients?.join(", ") || ""}
                    onChange={(e) => {
                      const recipients = e.target.value
                        .split(",")
                        .map((email) => email.trim())
                        .filter(Boolean);
                      updateChannel(index, { config: { recipients } });
                    }}
                    placeholder="admin@example.com, security@example.com"
                  />
                </FormControl>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="plain" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
              Update Alert
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
