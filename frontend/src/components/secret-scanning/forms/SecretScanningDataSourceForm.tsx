import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import {
  SecretScanningDataSource,
  TSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";
import {
  useCreateSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2/mutations";

import { SecretScanningDataSourceSchema, TSecretScanningDataSourceForm } from "./schemas";
import { SecretScanningDataSourceConfigFields } from "./SecretScanningDataSourceConfigFields";
import { SecretScanningDataSourceDetailsFields } from "./SecretScanningDataSourceDetailsFields";
import { SecretScanningDataSourceReviewFields } from "./SecretScanningDataSourceReviewFields";

type Props = {
  onComplete: (dataSource: TSecretScanningDataSource) => void;
  type: SecretScanningDataSource;
  onCancel: () => void;
  dataSource?: TSecretScanningDataSource;
};

const FORM_TABS: { name: string; key: string; fields: (keyof TSecretScanningDataSourceForm)[] }[] =
  [
    { name: "Configuration", key: "config", fields: ["config", "isAutoScanEnabled", "connection"] },
    { name: "Details", key: "details", fields: ["name", "description"] },
    { name: "Review", key: "review", fields: [] }
  ];

export const SecretScanningDataSourceForm = ({ type, onComplete, onCancel, dataSource }: Props) => {
  const createDataSource = useCreateSecretScanningDataSource();
  const updateDataSource = useUpdateSecretScanningDataSource();
  const { currentWorkspace } = useWorkspace();
  const { name: sourceType } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const formMethods = useForm<TSecretScanningDataSourceForm>({
    resolver: zodResolver(SecretScanningDataSourceSchema),
    defaultValues: dataSource ?? {
      type,
      isAutoScanEnabled: true // scott: this may need to be derived from type in the future
    },
    reValidateMode: "onChange"
  });

  const onSubmit = async ({ connection, ...formData }: TSecretScanningDataSourceForm) => {
    const mutation = dataSource
      ? updateDataSource.mutateAsync({
          dataSourceId: dataSource.id,
          projectId: dataSource.projectId,
          ...formData
        })
      : createDataSource.mutateAsync({
          ...formData,
          connectionId: connection?.id,
          projectId: currentWorkspace.id
        });
    try {
      const source = await mutation;

      createNotification({
        text: `Successfully ${source ? "updated" : "created"} ${sourceType} Data Source`,
        type: "success"
      });
      onComplete(source);
    } catch (err: any) {
      createNotification({
        title: `Failed to ${dataSource ? "update" : "create"} ${sourceType} Data Source`,
        text: err.message,
        type: "error"
      });
    }
  };

  const handlePrev = () => {
    if (selectedTabIndex === 0) {
      onCancel();
      return;
    }

    setSelectedTabIndex((prev) => prev - 1);
  };

  const {
    handleSubmit,
    trigger,
    formState: { isSubmitting }
  } = formMethods;

  const isStepValid = async (index: number) => trigger(FORM_TABS[index].fields);

  const isFinalStep = selectedTabIndex === FORM_TABS.length - 1;

  const handleNext = async () => {
    if (isFinalStep) {
      handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);

    if (!isValid) return;

    setSelectedTabIndex((prev) => prev + 1);
  };

  const isTabEnabled = async (index: number) => {
    let isEnabled = true;
    for (let i = index - 1; i >= 0; i -= 1) {
      // eslint-disable-next-line no-await-in-loop
      isEnabled = isEnabled && (await isStepValid(i));
    }

    return isEnabled;
  };

  return (
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
                  `w-30 -mb-[0.14rem] ${index > selectedTabIndex ? "opacity-30" : ""} px-4 py-2 text-sm font-medium outline-none disabled:opacity-60 ${
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
            <Tab.Panel>
              <SecretScanningDataSourceConfigFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretScanningDataSourceDetailsFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretScanningDataSourceReviewFields />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </FormProvider>
      <div className="flex w-full flex-row-reverse justify-between gap-4 pt-4">
        <Button
          onClick={handleNext}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
          colorSchema="secondary"
        >
          {isFinalStep ? `${dataSource ? "Update" : "Create"} Data Source` : "Next"}
        </Button>
        <Button onClick={handlePrev} colorSchema="secondary">
          Back
        </Button>
      </div>
    </form>
  );
};
