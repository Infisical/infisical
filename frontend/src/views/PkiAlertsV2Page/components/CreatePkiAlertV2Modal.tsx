import React, { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
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
  TCreatePkiAlertV2,
  TPkiAlertChannelConfigEmail,
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
  { name: "Alert Type", key: "alertType", fields: ["eventType"] },
  {
    name: "Details",
    key: "basicInfo",
    fields: ["name", "description", "alertBefore"]
  },
  { name: "Filters", key: "filterRules", fields: ["filters"] },
  { name: "Preview", key: "preview", fields: [] },
  { name: "Channels", key: "channels", fields: ["channels"] },
  { name: "Review", key: "review", fields: [] }
];

export const CreatePkiAlertV2Modal = ({ isOpen, onOpenChange, alertToEdit, alertId }: Props) => {
  const { currentProject } = useProject();
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

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
      channels: [
        {
          channelType: PkiAlertChannelTypeV2.EMAIL,
          config: { recipients: [] },
          enabled: true
        }
      ]
    },
    reValidateMode: "onBlur"
  });

  const { handleSubmit, trigger, reset } = formMethods;

  const { mutateAsync: createAlert } = useCreatePkiAlertV2();
  const { mutateAsync: updateAlert } = useUpdatePkiAlertV2();

  const handleModalClose = () => {
    reset();
    setSelectedTabIndex(0);
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
        channels: editingAlert.channels?.map(({ id, createdAt, updatedAt, ...channel }) => {
          if (channel.channelType === PkiAlertChannelTypeV2.EMAIL) {
            const emailConfig = channel.config as TPkiAlertChannelConfigEmail;
            return {
              ...channel,
              config: {
                recipients: Array.isArray(emailConfig.recipients) ? emailConfig.recipients : []
              }
            };
          }
          return channel;
        }) || [
          {
            channelType: PkiAlertChannelTypeV2.EMAIL,
            config: { recipients: [] },
            enabled: true
          }
        ]
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
        channels: [
          {
            channelType: PkiAlertChannelTypeV2.EMAIL,
            config: { recipients: [] },
            enabled: true
          }
        ]
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

  const handleNext = async () => {
    if (isFinalStep) {
      await handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);
    if (!isValid) return;

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
      >
        <form className={twMerge(isFinalStep && "max-h-[70vh] overflow-y-auto")}>
          <FormProvider {...formMethods}>
            <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
              <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
                {FORM_TABS.map((tab, index) => (
                  <Tab
                    onClick={async (e) => {
                      e.preventDefault();
                      const isEnabled = await isTabEnabled(index);
                      setSelectedTabIndex((prev) => (isEnabled ? index : prev));
                    }}
                    className={({ selected }) =>
                      `-mb-[0.14rem] whitespace-nowrap ${index > selectedTabIndex ? "opacity-30" : ""} px-4 py-2 text-sm font-medium outline-hidden disabled:opacity-60 ${
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
                <CreatePkiAlertV2FormSteps />
              </Tab.Panels>
            </Tab.Group>
          </FormProvider>

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
