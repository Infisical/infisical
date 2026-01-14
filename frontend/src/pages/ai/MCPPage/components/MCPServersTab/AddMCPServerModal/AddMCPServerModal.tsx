import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useProject } from "@app/context";
import {
  AiMcpServerAuthMethod,
  AiMcpServerCredentialMode,
  TCreateAiMcpServerDTO,
  useCreateAiMcpServer
} from "@app/hooks/api";

import {
  AddMCPServerFormSchema,
  MCPServerAuthMethod,
  MCPServerCredentialMode,
  TAddMCPServerForm
} from "./AddMCPServerForm.schema";
import { AuthenticationStep } from "./AuthenticationStep";
import { BasicInfoStep } from "./BasicInfoStep";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const FORM_TABS = [
  { name: "Basic Info", key: "basic-info", fields: ["name", "url", "credentialMode"] as const },
  {
    name: "Authentication",
    key: "authentication",
    fields: ["authMethod", "credentials"] as const
  }
];

export const AddMCPServerModal = ({ isOpen, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const { orgId } = useParams({ strict: false }) as { orgId?: string };
  const { currentProject } = useProject();
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const createMcpServer = useCreateAiMcpServer();

  const formMethods = useForm<TAddMCPServerForm>({
    resolver: zodResolver(AddMCPServerFormSchema),
    defaultValues: {
      name: "",
      description: "",
      url: "",
      credentialMode: MCPServerCredentialMode.SHARED,
      authMethod: MCPServerAuthMethod.OAUTH,
      credentials: {
        accessToken: "",
        refreshToken: "",
        tokenType: "Bearer"
      },
      oauthClientId: "",
      oauthClientSecret: ""
    } as TAddMCPServerForm
  });

  const { handleSubmit, trigger, reset, watch } = formMethods;

  const isFinalStep = selectedTabIndex === FORM_TABS.length - 1;

  // Check if authentication is complete based on method
  const authMethod = watch("authMethod");
  const credentials = watch("credentials");

  const isOAuthCompleted =
    authMethod === MCPServerAuthMethod.OAUTH &&
    "accessToken" in credentials &&
    Boolean(credentials.accessToken);

  const isBearerCompleted =
    authMethod === MCPServerAuthMethod.BEARER &&
    "token" in credentials &&
    Boolean(credentials.token);

  const isAuthCompleted = isOAuthCompleted || isBearerCompleted;

  const isStepValid = async (index: number) => {
    const { fields } = FORM_TABS[index];
    return trigger(fields as unknown as (keyof TAddMCPServerForm)[]);
  };

  const handleClose = () => {
    reset();
    setSelectedTabIndex(0);
    onOpenChange(false);
  };

  const onSubmit = async (data: TAddMCPServerForm) => {
    if (!currentProject?.id) {
      createNotification({
        text: "No project selected",
        type: "error"
      });
      return;
    }

    try {
      const server = await createMcpServer.mutateAsync({
        projectId: currentProject.id,
        name: data.name,
        url: data.url,
        description: data.description || undefined,
        credentialMode: data.credentialMode as unknown as AiMcpServerCredentialMode,
        authMethod: data.authMethod as unknown as AiMcpServerAuthMethod,
        credentials: data.credentials,
        oauthClientId: data.oauthClientId || undefined,
        oauthClientSecret: data.oauthClientSecret || undefined
      } as TCreateAiMcpServerDTO);

      createNotification({
        text: `Successfully added MCP server "${data.name}"`,
        type: "success"
      });

      reset();
      setSelectedTabIndex(0);
      onOpenChange(false);

      if (orgId) {
        navigate({
          to: "/organizations/$orgId/projects/ai/$projectId/mcp-servers/$serverId",
          params: { orgId, projectId: currentProject.id, serverId: server.id }
        });
      }
    } catch (error) {
      console.error("Failed to create MCP server:", error);
      createNotification({
        text: "Failed to create MCP server",
        type: "error"
      });
    }
  };

  const handleNext = async () => {
    const isValid = await isStepValid(selectedTabIndex);
    if (!isValid) return;

    if (isFinalStep) {
      handleSubmit(onSubmit)();
      return;
    }

    setSelectedTabIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    setSelectedTabIndex((prev) => prev - 1);
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Add MCP Server"
        subTitle="Configure connection details and authentication for a new MCP server"
        className="max-w-2xl"
        bodyClassName="overflow-visible"
        onClose={handleClose}
      >
        <FormProvider {...formMethods}>
          <form>
            <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
              <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
                {FORM_TABS.map((tab, index) => (
                  <Tab
                    key={tab.key}
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
                  >
                    {index + 1}. {tab.name}
                  </Tab>
                ))}
              </Tab.List>
              <Tab.Panels>
                <Tab.Panel>
                  <BasicInfoStep />
                </Tab.Panel>
                <Tab.Panel>
                  <AuthenticationStep onOAuthSuccess={() => handleSubmit(onSubmit)()} />
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>

            <div className="mt-6 flex w-full justify-between gap-4">
              {selectedTabIndex > 0 ? (
                <Button onClick={handleBack} colorSchema="secondary">
                  Back
                </Button>
              ) : (
                <div />
              )}
              <Button
                onClick={handleNext}
                colorSchema="primary"
                isLoading={createMcpServer.isPending}
                isDisabled={createMcpServer.isPending || (isFinalStep && !isAuthCompleted)}
              >
                {isFinalStep ? "Add MCP Server" : "Next"}
              </Button>
            </div>
          </form>
        </FormProvider>
      </ModalContent>
    </Modal>
  );
};
