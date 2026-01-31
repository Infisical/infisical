import React, { useState } from "react";
import { FieldError, FormProvider, useForm } from "react-hook-form";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useProject } from "@app/context";
import {
  createPkiAlertV2Schema,
  PkiAlertChannelTypeV2,
  PkiAlertEventTypeV2,
  SIGNING_SECRET_MASK,
  TCreatePkiAlertV2,
  TPkiAlertChannelConfigEmail,
  TPkiAlertChannelConfigWebhook,
  TPkiAlertChannelConfigWebhookResponse,
  TPkiAlertV2,
  TUpdatePkiAlertV2,
  updatePkiAlertV2Schema,
  useCreatePkiAlertV2,
  useGetPkiAlertV2ById,
  useUpdatePkiAlertV2
} from "@app/hooks/api/pkiAlertsV2";

import { CreatePkiAlertV2FormSteps } from "./CreatePkiAlertV2FormSteps";

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  alertToEdit?: TPkiAlertV2;
  alertId?: string;
}

type TFormData = TCreatePkiAlertV2;

const FORM_TABS: { name: string; key: string; fields: (keyof TFormData)[] }[] = [
  {
    name: "Details",
    key: "basicInfo",
    fields: ["eventType", "name", "description", "alertBefore"]
  },
  { name: "Filters", key: "filterRules", fields: ["filters"] },
  { name: "Preview", key: "preview", fields: [] },
  { name: "Channels", key: "channels", fields: ["channels"] },
  { name: "Review", key: "review", fields: [] }
];

const CHANNELS_TAB_INDEX = 3;

export const CreatePkiAlertV2Modal = ({ isOpen, onOpenChange, alertToEdit, alertId }: Props) => {
  const { currentProject } = useProject();
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [expandedChannel, setExpandedChannel] = useState<string | undefined>(undefined);

  const { data: fetchedAlert } = useGetPkiAlertV2ById(
    { alertId: alertId || "" },
    { enabled: !!alertId && isOpen && !alertToEdit }
  );

  const editingAlert = alertToEdit || fetchedAlert;
  const isEditing = !!(editingAlert || alertId);

  const formMethods = useForm<TFormData>({
    resolver: zodResolver(isEditing ? updatePkiAlertV2Schema : createPkiAlertV2Schema),
    defaultValues: {
      projectId: currentProject?.id || "",
      name: "",
      description: "",
      eventType: PkiAlertEventTypeV2.EXPIRATION,
      alertBefore: "30d",
      filters: [],
      enabled: true,
      channels: []
    },
    reValidateMode: "onBlur"
  });

  const {
    handleSubmit,
    trigger,
    reset,
    formState: { errors }
  } = formMethods;

  const { mutateAsync: createAlert } = useCreatePkiAlertV2();
  const { mutateAsync: updateAlert } = useUpdatePkiAlertV2();

  const handleModalClose = () => {
    reset();
    setSelectedTabIndex(0);
    setExpandedChannel(undefined);
    onOpenChange(false);
  };

  React.useEffect(() => {
    if (editingAlert && isEditing) {
      reset({
        projectId: currentProject?.id || "",
        name: editingAlert.name,
        description: editingAlert.description || "",
        eventType: editingAlert.eventType,
        alertBefore: editingAlert.alertBefore || "30d",
        filters: editingAlert.filters || [],
        enabled: editingAlert.enabled,
        channels:
          editingAlert.channels?.map(({ createdAt, updatedAt, ...channel }) => {
            if (channel.channelType === PkiAlertChannelTypeV2.EMAIL) {
              const emailConfig = channel.config as TPkiAlertChannelConfigEmail;
              return {
                ...channel,
                config: {
                  recipients: Array.isArray(emailConfig.recipients) ? emailConfig.recipients : []
                }
              };
            }
            if (channel.channelType === PkiAlertChannelTypeV2.WEBHOOK) {
              const webhookConfig = channel.config as TPkiAlertChannelConfigWebhookResponse;
              return {
                ...channel,
                config: {
                  url: webhookConfig.url,
                  // Show mask if secret exists, otherwise undefined
                  signingSecret: webhookConfig.hasSigningSecret ? SIGNING_SECRET_MASK : undefined
                }
              };
            }
            return channel;
          }) || []
      });
    } else if (!isEditing) {
      reset({
        projectId: currentProject?.id || "",
        name: "",
        description: "",
        eventType: PkiAlertEventTypeV2.EXPIRATION,
        alertBefore: "30d",
        filters: [],
        enabled: true,
        channels: []
      });
    }
  }, [editingAlert, isEditing, currentProject?.id, reset]);

  const onSubmit = async (data: TFormData) => {
    if (!currentProject?.id) return;

    const processedData = {
      ...data,
      channels: data.channels?.map((channel) => {
        if (channel.channelType === PkiAlertChannelTypeV2.EMAIL) {
          const emailConfig = channel.config as TPkiAlertChannelConfigEmail;
          return {
            ...channel,
            config: {
              recipients: Array.isArray(emailConfig.recipients) ? emailConfig.recipients : []
            }
          };
        }
        if (channel.channelType === PkiAlertChannelTypeV2.WEBHOOK) {
          const webhookConfig = channel.config as TPkiAlertChannelConfigWebhook;

          // Determine what to send for signingSecret
          let signingSecret: string | null | undefined;
          if (webhookConfig.signingSecret === SIGNING_SECRET_MASK) {
            // User didn't change it - send undefined to preserve existing
            signingSecret = undefined;
          } else if (!webhookConfig.signingSecret) {
            // User cleared it - send null to remove from DB
            signingSecret = null;
          } else {
            // User entered a new value (or appended to mask)
            signingSecret = webhookConfig.signingSecret;
          }

          return {
            ...channel,
            config: {
              url: webhookConfig.url,
              signingSecret
            }
          };
        }
        return channel;
      })
    };

    try {
      if (isEditing && (alertId || editingAlert?.id)) {
        await updateAlert({
          alertId: alertId || editingAlert!.id,
          ...processedData
        } as TUpdatePkiAlertV2);
      } else {
        await createAlert({
          ...processedData,
          projectId: currentProject.id
        });
      }

      createNotification({
        text: `PKI alert ${isEditing ? "updated" : "created"} successfully`,
        type: "success"
      });

      handleModalClose();
    } catch {
      createNotification({
        text: `Failed to ${isEditing ? "update" : "create"} PKI alert`,
        type: "error"
      });
    }
  };

  const handlePrev = () => {
    if (selectedTabIndex === 0) {
      onOpenChange(false);
      return;
    }
    setSelectedTabIndex((prev) => prev - 1);
  };

  const isStepValid = async (index: number) => trigger(FORM_TABS[index].fields);

  const isFinalStep = selectedTabIndex === FORM_TABS.length - 1;

  // Helper to find first channel with error and expand it
  const getFirstChannelErrorIndex = (): number => {
    if (!errors.channels) return -1;
    const channelsErrors = errors.channels as Array<FieldError | undefined>;
    return channelsErrors.findIndex((err) => err !== undefined);
  };

  const handleNext = async () => {
    if (isFinalStep) {
      await handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);
    if (!isValid) {
      // If on channels tab and validation failed, expand first channel with error
      if (selectedTabIndex === CHANNELS_TAB_INDEX) {
        const firstErrorIdx = getFirstChannelErrorIndex();
        if (firstErrorIdx >= 0) {
          setExpandedChannel(`channel-${firstErrorIdx}`);
        }
      }
      return;
    }

    setSelectedTabIndex((prev) => prev + 1);
  };

  const isTabEnabled = async (index: number) => {
    const validationPromises = [];
    for (let i = index - 1; i >= 0; i -= 1) {
      validationPromises.push(isStepValid(i));
    }
    const results = await Promise.all(validationPromises);
    return results.every(Boolean);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleModalClose}>
      <ModalContent
        title={`${isEditing ? "Update" : "Create"} Certificate Alert`}
        className="max-w-2xl"
        closeOnOutsideClick={false}
      >
        <form
          className={twMerge(
            "flex min-h-[60vh] flex-col",
            isFinalStep && "max-h-[70vh] overflow-y-auto"
          )}
        >
          <div className="flex-1 overflow-y-auto">
            <FormProvider {...formMethods}>
              <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
                <Tab.List className="-pb-1 mb-6 flex w-full justify-center border-b-2 border-mineshaft-600">
                  {FORM_TABS.map((tab, index) => (
                    <Tab
                      onClick={async (e) => {
                        e.preventDefault();
                        const isEnabled = await isTabEnabled(index);
                        setSelectedTabIndex((prev) => (isEnabled ? index : prev));
                      }}
                      className={({ selected }) =>
                        `-mb-[0.14rem] w-28 whitespace-nowrap ${index > selectedTabIndex ? "opacity-30" : ""} px-2 py-2 text-sm font-medium outline-hidden disabled:opacity-60 ${
                          selected
                            ? "border-b-2 border-mineshaft-300 text-mineshaft-200"
                            : "text-bunker-300"
                        }`
                      }
                      key={tab.key}
                    >
                      {index + 1}. {tab.name}
                    </Tab>
                  ))}
                </Tab.List>
                <Tab.Panels>
                  <CreatePkiAlertV2FormSteps
                    expandedChannel={expandedChannel}
                    setExpandedChannel={setExpandedChannel}
                  />
                </Tab.Panels>
              </Tab.Group>
            </FormProvider>
          </div>

          <div className="flex w-full flex-row-reverse justify-between gap-4 pt-4">
            <Button onClick={handleNext} colorSchema="secondary">
              {isFinalStep ? `${isEditing ? "Update" : "Create"} Alert` : "Next"}
            </Button>
            <Button onClick={handlePrev} colorSchema="secondary">
              {selectedTabIndex === 0 ? "Cancel" : "Back"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
