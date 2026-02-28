import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context/OrgPermissionContext";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { gatewaysQueryKeys, TAiMcpServer, useUpdateAiMcpServer } from "@app/hooks/api";

const EditMCPServerFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64, "Name must be 64 characters or less"),
  description: z.string().trim().max(256, "Description must be 256 characters or less").optional(),
  gatewayId: z.string().uuid().nullable().optional()
});

type TEditMCPServerForm = z.infer<typeof EditMCPServerFormSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  server: TAiMcpServer | null;
};

export const EditMCPServerModal = ({ isOpen, onOpenChange, server }: Props) => {
  const updateMcpServer = useUpdateAiMcpServer();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TEditMCPServerForm>({
    resolver: zodResolver(EditMCPServerFormSchema),
    defaultValues: {
      name: "",
      description: "",
      gatewayId: null
    }
  });

  // Reset form when server changes
  useEffect(() => {
    if (server) {
      reset({
        name: server.name,
        description: server.description || "",
        gatewayId: server.gatewayId || null
      });
    }
  }, [server, reset]);

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: TEditMCPServerForm) => {
    if (!server) return;

    try {
      await updateMcpServer.mutateAsync({
        serverId: server.id,
        name: data.name,
        description: data.description || undefined,
        gatewayId: data.gatewayId
      });

      createNotification({
        text: `Successfully updated MCP server "${data.name}"`,
        type: "success"
      });

      handleClose();
    } catch (error) {
      console.error("Failed to update MCP server:", error);
      createNotification({
        text: "Failed to update MCP server",
        type: "error"
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Edit MCP Server"
        subTitle="Update the server details"
        onClose={handleClose}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Server Name"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="My MCP Server" />
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
                  placeholder="Optional description for this MCP server"
                  rows={3}
                />
              </FormControl>
            )}
          />

          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Controller
                control={control}
                name="gatewayId"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    label="Gateway"
                    helperText="Select a gateway to route connections through a private network"
                  >
                    <Tooltip
                      isDisabled={isAllowed}
                      content="Restricted access. You don't have permission to attach gateways to resources."
                    >
                      <div>
                        <Select
                          isDisabled={!isAllowed}
                          value={value ?? "__none__"}
                          onValueChange={(val) => onChange(val === "__none__" ? null : val)}
                          className="w-full border border-mineshaft-500"
                          dropdownContainerClassName="max-w-none"
                          isLoading={isGatewaysLoading}
                          placeholder="Default: Internet Gateway"
                          position="popper"
                        >
                          <SelectItem value="__none__">Internet Gateway</SelectItem>
                          {gateways?.map((el) => (
                            <SelectItem value={el.id} key={el.id}>
                              {el.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                    </Tooltip>
                  </FormControl>
                )}
              />
            )}
          </OrgPermissionCan>

          <div className="mt-6 flex justify-end gap-4">
            <Button onClick={handleClose} colorSchema="secondary" type="button">
              Cancel
            </Button>
            <Button
              type="submit"
              colorSchema="primary"
              isLoading={isSubmitting || updateMcpServer.isPending}
              isDisabled={isSubmitting || updateMcpServer.isPending}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
