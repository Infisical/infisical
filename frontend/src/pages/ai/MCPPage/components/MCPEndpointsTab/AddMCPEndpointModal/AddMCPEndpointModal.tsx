import { Controller, useForm } from "react-hook-form";
import { faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  Input,
  Modal,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useCreateAiMcpEndpoint, useListAiMcpServers } from "@app/hooks/api";

import { AddMCPEndpointFormSchema, TAddMCPEndpointForm } from "./AddMCPEndpointForm.schema";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddMCPEndpointModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const createEndpoint = useCreateAiMcpEndpoint();

  // Fetch available MCP servers for selection
  const { data: serversData, isLoading: isLoadingServers } = useListAiMcpServers({
    projectId: currentProject?.id || ""
  });

  const servers = serversData?.servers || [];

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<TAddMCPEndpointForm>({
    resolver: zodResolver(AddMCPEndpointFormSchema),
    defaultValues: {
      name: "",
      description: "",
      serverIds: []
    }
  });

  const selectedServerIds = watch("serverIds");

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleServerToggle = (serverId: string) => {
    const current = selectedServerIds || [];
    if (current.includes(serverId)) {
      setValue(
        "serverIds",
        current.filter((id) => id !== serverId)
      );
    } else {
      setValue("serverIds", [...current, serverId]);
    }
  };

  const onSubmit = async (data: TAddMCPEndpointForm) => {
    if (!currentProject?.id) {
      createNotification({
        text: "No project selected",
        type: "error"
      });
      return;
    }

    try {
      await createEndpoint.mutateAsync({
        projectId: currentProject.id,
        name: data.name,
        description: data.description || undefined,
        serverIds: data.serverIds
      });

      createNotification({
        text: `Successfully created MCP endpoint "${data.name}"`,
        type: "success"
      });

      handleClose();
    } catch (error) {
      console.error("Failed to create MCP endpoint:", error);
      createNotification({
        text: "Failed to create MCP endpoint",
        type: "error"
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Create MCP Endpoint"
        subTitle="Configure a unified entrypoint interface with security rules and governance controls"
        className="max-w-2xl"
        onClose={handleClose}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <p className="mb-4 text-sm text-bunker-300">
            Create an endpoint to aggregate multiple MCP servers into a single entrypoint.
          </p>

          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Endpoint Name"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="production-ai-proxy" />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Description"
                isOptional
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <TextArea
                  {...field}
                  placeholder="Enter endpoint description"
                  className="resize-none!"
                  rows={3}
                />
              </FormControl>
            )}
          />

          <div className="mt-4">
            <FormControl label="Connected Servers" isOptional>
              <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-3">
                {isLoadingServers && <p className="text-sm text-bunker-400">Loading servers...</p>}
                {!isLoadingServers && servers.length === 0 && (
                  <div className="flex flex-col items-center py-4 text-center">
                    <FontAwesomeIcon icon={faServer} className="mb-2 text-2xl text-bunker-400" />
                    <p className="text-sm text-bunker-400">No MCP servers available</p>
                    <p className="text-xs text-bunker-500">
                      Add MCP servers first to connect them to this endpoint
                    </p>
                  </div>
                )}
                {!isLoadingServers && servers.length > 0 && (
                  <div className="space-y-2">
                    {servers.map((server) => (
                      <div
                        key={server.id}
                        className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-mineshaft-700"
                      >
                        <Checkbox
                          id={`server-${server.id}`}
                          className="mt-0.5"
                          isChecked={selectedServerIds?.includes(server.id)}
                          onCheckedChange={() => handleServerToggle(server.id)}
                        />
                        <label
                          htmlFor={`server-${server.id}`}
                          className="flex flex-1 cursor-pointer items-start gap-2"
                        >
                          <FontAwesomeIcon
                            icon={faServer}
                            className="mt-0.5 text-sm text-bunker-400"
                          />
                          <div className="flex-1">
                            <p className="text-sm text-mineshaft-200">{server.name}</p>
                            {server.description && (
                              <p className="text-xs text-bunker-400">{server.description}</p>
                            )}
                          </div>
                        </label>
                        <span className="mt-0.5 text-xs text-bunker-400">
                          {server.toolsCount ?? 0} tools
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedServerIds && selectedServerIds.length > 0 && (
                  <p className="mt-2 text-xs text-bunker-400">
                    {selectedServerIds.length} server{selectedServerIds.length !== 1 ? "s" : ""}{" "}
                    selected
                  </p>
                )}
              </div>
            </FormControl>
          </div>

          <div className="mt-6 flex justify-end gap-4">
            <Button onClick={handleClose} colorSchema="secondary" type="button">
              Cancel
            </Button>
            <Button
              type="submit"
              colorSchema="primary"
              isLoading={isSubmitting || createEndpoint.isPending}
            >
              Create Endpoint
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
