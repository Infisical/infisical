import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { SecretRotationV2ConfigurationFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ConfigurationFields";
import { SecretRotationV2DetailsFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2DetailsFields";
import { SecretRotationV2ParametersFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ParametersFields";
import { SecretRotationV2ReviewFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ReviewFields";
import { SecretRotationV2SecretsMappingFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2SecretsMappingFields";
import {
  SecretRotationSheetFooter,
  SecretRotationSheetScrollArea
} from "@app/components/secret-rotations-v2/SecretRotationSheet";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";
import { IS_ROTATION_DUAL_CREDENTIALS, SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import {
  SecretRotation,
  TSecretRotationV2,
  useSecretRotationV2Option
} from "@app/hooks/api/secretRotationsV2";
import {
  useCreateSecretRotationV2,
  useUpdateSecretRotationV2
} from "@app/hooks/api/secretRotationsV2/mutations";

import { SecretRotationV2FormSchema, TSecretRotationV2Form } from "./schemas";

type Props = {
  onComplete: (secretRotation: TSecretRotationV2) => void;
  type: SecretRotation;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  /** When true, fill the sheet body instead of constraining modal height. */
  isSheet?: boolean;
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
  secretRotation?: TSecretRotationV2;
  initialFormData?: Partial<TSecretRotationV2Form>;
};

const FORM_TABS: { name: string; key: string; fields: (keyof TSecretRotationV2Form)[] }[] = [
  {
    name: "Configuration",
    key: "configuration",
    fields: [
      "isAutoRotationEnabled",
      "environment",
      "rotationInterval",
      "connection",
      "rotateAtUtc"
    ]
  },
  // @ts-expect-error temporary parameters aren't present on all forms
  { name: "Parameters", key: "parameters", fields: ["parameters", "temporaryParameters"] },
  { name: "Mappings", key: "secretsMapping", fields: ["secretsMapping"] },
  { name: "Details", key: "details", fields: ["name", "description"] },
  { name: "Review", key: "review", fields: [] }
];

const DEFAULT_ROTATION_INTERVAL = 30;

export const SecretRotationV2Form = ({
  type,
  onComplete,
  onCancel,
  onDirtyChange,
  isSheet = false,
  environment: envSlug,
  secretPath,
  secretRotation,
  environments,
  initialFormData
}: Props) => {
  const createSecretRotation = useCreateSecretRotationV2();
  const updateSecretRotation = useUpdateSecretRotationV2();
  const { currentProject } = useProject();
  const { name: rotationType } = SECRET_ROTATION_MAP[type];

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [hasDirtyBaseline, setHasDirtyBaseline] = useState(false);

  const { rotationOption } = useSecretRotationV2Option(type);

  const formMethods = useForm<TSecretRotationV2Form>({
    resolver: zodResolver(SecretRotationV2FormSchema(Boolean(secretRotation))),
    defaultValues: (secretRotation
      ? {
          ...secretRotation,
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath
        }
      : {
          type,
          isAutoRotationEnabled: IS_ROTATION_DUAL_CREDENTIALS[type],
          rotationInterval: DEFAULT_ROTATION_INTERVAL,
          rotateAtUtc: {
            hours: 0,
            minutes: 0
          },
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath,
          ...((rotationOption?.template as object) ?? {}),
          ...(initialFormData as object)
        }) as Partial<TSecretRotationV2Form>,
    // Step Next uses trigger(), which never sets isSubmitted — so reValidateMode alone
    // never runs. mode must be onChange from init (RHF freezes the mode flags at create).
    mode: "onChange",
    reValidateMode: "onChange"
  });

  // Re-baseline after mount-time control sync (e.g. Radix Select) so prefills aren't dirty.
  // Don't report dirty until that baseline lands — otherwise a close during the gap false-trips.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      formMethods.reset(formMethods.getValues());
      setHasDirtyBaseline(true);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [formMethods]);

  const isFormDirty =
    hasDirtyBaseline && (formMethods.formState.isDirty || selectedTabIndex > 0);
  useEffect(() => {
    onDirtyChange?.(isFormDirty);
    return () => onDirtyChange?.(false);
  }, [isFormDirty, onDirtyChange]);

  const onSubmit = async ({ environment, connection, ...formData }: TSecretRotationV2Form) => {
    const mutation = secretRotation
      ? updateSecretRotation.mutateAsync({
          rotationId: secretRotation.id,
          projectId: secretRotation.projectId,
          ...formData
        })
      : createSecretRotation.mutateAsync({
          ...formData,

          connectionId: connection.id,
          environment: environment.slug,
          projectId: currentProject.id
        });
    const rotation = await mutation;

    createNotification({
      text: `Successfully ${secretRotation ? "updated" : "created"} ${rotationType} Rotation`,
      type: "success"
    });
    onComplete(rotation);
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

  const selectedTab = FORM_TABS[selectedTabIndex].key;

  return (
    <FormProvider {...formMethods}>
      <form
        className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", !isSheet && "max-h-[70vh]")}
        onSubmit={(event) => event.preventDefault()}
      >
        <Tabs
          value={selectedTab}
          onValueChange={async (value) => {
            const index = FORM_TABS.findIndex((tab) => tab.key === value);
            if (index < 0) return;
            const isEnabled = await isTabEnabled(index);
            if (isEnabled) setSelectedTabIndex(index);
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList variant="project" className="mx-6 mt-4 w-auto shrink-0 justify-start">
            {FORM_TABS.map((tab, index) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className={index > selectedTabIndex ? "opacity-40" : undefined}
              >
                {index + 1}. {tab.name}
              </TabsTrigger>
            ))}
          </TabsList>
          <SecretRotationSheetScrollArea>
            <div className="space-y-3 p-6">
              <TabsContent value="configuration" className="mt-0">
                <SecretRotationV2ConfigurationFields
                  isUpdate={Boolean(secretRotation)}
                  environments={environments}
                />
              </TabsContent>
              <TabsContent value="parameters" className="mt-0">
                <SecretRotationV2ParametersFields />
              </TabsContent>
              <TabsContent value="secretsMapping" className="mt-0">
                <SecretRotationV2SecretsMappingFields />
              </TabsContent>
              <TabsContent value="details" className="mt-0">
                <SecretRotationV2DetailsFields />
              </TabsContent>
              <TabsContent value="review" className="mt-0">
                <SecretRotationV2ReviewFields />
              </TabsContent>
            </div>
          </SecretRotationSheetScrollArea>
        </Tabs>
        <SecretRotationSheetFooter>
          <Button type="button" variant="ghost" className="mr-auto" onClick={handlePrev}>
            Back
          </Button>
          <Button
            type="button"
            variant="project"
            onClick={handleNext}
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            {isFinalStep ? `${secretRotation ? "Update" : "Create"} Secret Rotation` : "Next"}
          </Button>
        </SecretRotationSheetFooter>
      </form>
    </FormProvider>
  );
};
