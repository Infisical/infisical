import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
import {
  TAiMcpEndpoint,
  useGetAiMcpEndpointById,
  useListAiMcpServers,
  useUpdateAiMcpEndpoint
} from "@app/hooks/api";

const EditMCPEndpointFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64, "Name must be 64 characters or less"),
  description: z.string().trim().max(256, "Description must be 256 characters or less").optional(),
  serverIds: z.array(z.string()).default([])
});

type TEditMCPEndpointForm = z.infer<typeof EditMCPEndpointFormSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  endpoint: TAiMcpEndpoint | null;
};

export const EditMCPEndpointModal = ({ isOpen, onOpenChange, endpoint }: Props) => {
  const updateEndpoint = useUpdateAiMcpEndpoint();

  // Fetch full endpoint details including serverIds
  const { data: endpointDetails } = useGetAiMcpEndpointById({
    endpointId: endpoint?.id || ""
  });

  // Fetch available MCP servers for selection
  const { data: serversData, isLoading: isLoadingServers } = useListAiMcpServers({
    projectId: endpoint?.projectId || ""
  });

  const servers = serversData?.servers || [];

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<TEditMCPEndpointForm>({
    resolver: zodResolver(EditMCPEndpointFormSchema),
    defaultValues: {
      name: "",
      description: "",
      serverIds: []
    }
  });

  const selectedServerIds = watch("serverIds");

  // Reset form when endpoint details change
  useEffect(() => {
    if (endpointDetails) {
      reset({
        name: endpointDetails.name,
        description: endpointDetails.description || "",
        serverIds: endpointDetails.serverIds || []
      });
    }
  }, [endpointDetails, reset]);

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

  const onSubmit = async (data: TEditMCPEndpointForm) => {
    if (!endpoint) return;

    try {
      await updateEndpoint.mutateAsync({
        endpointId: endpoint.id,
        name: data.name,
        description: data.description || undefined,
        serverIds: data.serverIds
      });

      createNotification({
        text: `Successfully updated MCP endpoint "${data.name}"`,
        type: "success"
      });

      handleClose();
    } catch (error) {
      console.error("Failed to update MCP endpoint:", error);
      createNotification({
        text: "Failed to update MCP endpoint",
        type: "error"
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Edit MCP Endpoint"
        subTitle="Update the endpoint details and connected servers"
        className="max-w-2xl"
        onClose={handleClose}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
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
              <FormControl label="Description" isError={Boolean(error)} errorText={error?.message}>
                <TextArea
                  {...field}
                  placeholder="Optional description for this endpoint"
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
                          id={`edit-server-${server.id}`}
                          className="mt-0.5"
                          isChecked={selectedServerIds?.includes(server.id)}
                          onCheckedChange={() => handleServerToggle(server.id)}
                        />
                        <label
                          htmlFor={`edit-server-${server.id}`}
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
              isLoading={isSubmitting || updateEndpoint.isPending}
              isDisabled={isSubmitting || updateEndpoint.isPending}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
