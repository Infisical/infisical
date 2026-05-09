import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { HONEY_TOKEN_DEFAULT_SECRET_NAMES, HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { useCreateHoneyToken, useUpdateHoneyToken } from "@app/hooks/api/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";

import { HoneyTokenMappingFields } from "./HoneyTokenMappingFields/HoneyTokenMappingFields";
import { HoneyTokenConfigurationFields } from "./HoneyTokenConfigurationFields";
import { HoneyTokenDetailsFields } from "./HoneyTokenDetailsFields";
import { HoneyTokenFormSchema, THoneyTokenForm } from "./schemas";

type Props = {
  onComplete: () => void;
  type: HoneyTokenType;
  onCancel: () => void;
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
  honeyToken?: TDashboardHoneyToken;
};

const FORM_TABS: { name: string; key: string; fields: (keyof THoneyTokenForm)[] }[] = [
  {
    name: "Configuration",
    key: "configuration",
    fields: ["environment"]
  },
  { name: "Mapping", key: "mapping", fields: ["secretsMapping"] },
  { name: "Details", key: "details", fields: ["name", "description"] }
];

export const HoneyTokenForm = ({
  type,
  onComplete,
  onCancel,
  environment: envSlug,
  secretPath,
  environments,
  honeyToken
}: Props) => {
  const createHoneyToken = useCreateHoneyToken();
  const updateHoneyToken = useUpdateHoneyToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { name: tokenTypeName } = HONEY_TOKEN_MAP[type];

  const isUpdate = Boolean(honeyToken);
  const formTabs = isUpdate ? FORM_TABS.filter((tab) => tab.key !== "configuration") : FORM_TABS;

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const formMethods = useForm<THoneyTokenForm>({
    resolver: zodResolver(HoneyTokenFormSchema),
    defaultValues: honeyToken
      ? {
          ...honeyToken,
          environment: currentProject?.environments.find(
            (env) => env.slug === honeyToken.environment.slug
          ),
          secretPath
        }
      : {
          type,
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath,
          secretsMapping: HONEY_TOKEN_DEFAULT_SECRET_NAMES[type]
        },
    reValidateMode: "onChange"
  });

  const onSubmit = async ({ environment, ...formData }: THoneyTokenForm) => {
    if (honeyToken) {
      await updateHoneyToken.mutateAsync({
        honeyTokenId: honeyToken.id,
        projectId: honeyToken.projectId,
        name: formData.name,
        description: formData.description,
        secretsMapping: formData.secretsMapping
      });

      createNotification({
        text: `Successfully updated ${tokenTypeName} Honey Token`,
        type: "success"
      });
    } else {
      const { stackDeployment } = await createHoneyToken.mutateAsync({
        ...formData,
        environment: environment.slug,
        projectId: currentProject.id
      });

      if (stackDeployment && !stackDeployment.deployed) {
        const isDeploying = stackDeployment.status?.endsWith("_IN_PROGRESS");
        createNotification({
          text: isDeploying
            ? "Token was created, but stack is still deploying."
            : "Token was created, but stack is not deployed yet.",
          callToAction: (
            <Link
              className="inline-flex h-7 items-center rounded border border-mineshaft-500 px-2 text-xs text-primary transition-colors hover:bg-mineshaft-700 hover:text-primary"
              to={ROUTE_PATHS.Organization.SettingsPage.path}
              params={{ orgId: currentOrg.id }}
              search={{ selectedTab: "product-settings" }}
            >
              Go to settings
            </Link>
          ),
          type: "warning"
        });
      } else {
        createNotification({
          text: `Successfully created ${tokenTypeName} Honey Token`,
          type: "success"
        });
      }
    }
    onComplete();
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

  const isStepValid = async (index: number) => trigger(formTabs[index].fields);

  const isFinalStep = selectedTabIndex === formTabs.length - 1;

  const [isValidating, setIsValidating] = useState(false);

  const checkMappingConflicts = async (): Promise<boolean> => {
    const { environment, secretsMapping } = formMethods.getValues();
    if (!environment?.slug || !secretsMapping) return true;

    const mappingEntries = Object.entries(secretsMapping);
    const values = mappingEntries.map(([, v]) => v);

    if (new Set(values).size !== values.length) {
      formMethods.setError("secretsMapping", {
        message: "Secret mapping names must be unique."
      });
      return false;
    }

    try {
      setIsValidating(true);
      const data = await fetchProjectSecrets({
        projectId: currentProject.id,
        environment: environment.slug,
        secretPath
      });

      const ownKeys = honeyToken ? new Set(Object.values(honeyToken.secretsMapping)) : new Set();
      const existingKeys = new Set(data.secrets.map((s) => s.secretKey));
      const conflicts = values.filter((key) => existingKeys.has(key) && !ownKeys.has(key));

      if (conflicts.length > 0) {
        formMethods.setError("secretsMapping", {
          message: `The following secrets already exist in this path: ${conflicts.join(", ")}`
        });
        return false;
      }
    } catch {
      createNotification({
        text: "Failed to validate secret names. Please try again.",
        type: "error"
      });
      return false;
    } finally {
      setIsValidating(false);
    }

    return true;
  };

  const mappingStepIndex = formTabs.findIndex((tab) => tab.key === "mapping");

  const handleNext = async () => {
    if (isFinalStep) {
      handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);

    if (!isValid) return;

    if (selectedTabIndex === mappingStepIndex && !isUpdate) {
      const noConflicts = await checkMappingConflicts();
      if (!noConflicts) return;
    }

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
    <form className="flex max-h-[75vh] flex-col">
      <div className="min-h-0 flex-1">
        <FormProvider {...formMethods}>
          <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
            <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
              {formTabs.map((tab, index) => (
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
              {!isUpdate && (
                <Tab.Panel>
                  <HoneyTokenConfigurationFields environments={environments} />
                </Tab.Panel>
              )}
              <Tab.Panel>
                <HoneyTokenMappingFields />
              </Tab.Panel>
              <Tab.Panel>
                <HoneyTokenDetailsFields />
              </Tab.Panel>
            </Tab.Panels>
          </Tab.Group>
        </FormProvider>
      </div>
      <div className="flex w-full flex-shrink-0 flex-row-reverse justify-between gap-4 pt-4">
        <Button
          onClick={handleNext}
          isPending={isSubmitting || isValidating}
          isDisabled={isSubmitting || isValidating}
          variant={isFinalStep ? "org" : "outline"}
        >
          {isFinalStep ? `${honeyToken ? "Update" : "Create"} Honey Token` : "Next"}
        </Button>
        <Button onClick={handlePrev} variant="outline">
          Back
        </Button>
      </div>
    </form>
  );
};
