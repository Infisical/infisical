import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Modal, ModalContent } from "@app/components/v2";
import {
  useGetMcpServerConfig,
  useGetMcpServerTools,
  useUpdateMcpServerConfig
} from "@app/hooks/api/pam";

type Props = {
  onOpenChange: (isOpen: boolean) => void;
  accountId: string;
};

const schema = z.object({
  toolsAllowed: z
    .object({
      name: z.string().trim().min(1)
    })
    .array()
});
type TFormData = z.infer<typeof schema>;

const Content = ({ accountId, onOpenChange }: Props) => {
  const { data: mcpServerTools, isPending: isMcpServerToolLoading } =
    useGetMcpServerTools(accountId);

  const { data: mcpServerConfig, isPending: isMcpServerConfigLoading } =
    useGetMcpServerConfig(accountId);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TFormData>({
    resolver: zodResolver(schema),
    values: {
      toolsAllowed: mcpServerConfig?.statement?.toolsAllowed?.map((name) => ({ name })) || []
    }
  });
  const updateMcpServerConfig = useUpdateMcpServerConfig();

  const onFormSubmit = async (data: TFormData) => {
    await updateMcpServerConfig.mutateAsync({
      accountId,
      config: {
        version: 1,
        statement: {
          toolsAllowed: data.toolsAllowed.map((el) => el.name)
        }
      }
    });
    createNotification({
      text: "Successfully updated configuration",
      type: "success"
    });
    onOpenChange(false);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="toolsAllowed"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl label="Allowed Tools" errorText={error?.message} isError={Boolean(error)}>
            <FilterableSelect
              isMulti
              isLoading={isMcpServerToolLoading || isMcpServerConfigLoading}
              placeholder="Select tool..."
              options={mcpServerTools}
              onChange={onChange}
              value={value}
              getOptionValue={(option) => option.name}
              getOptionLabel={(option) => option.name}
            />
          </FormControl>
        )}
      />
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Update
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export const PamMcpConfigurationModal = ({
  onOpenChange,
  isOpen,
  accountId
}: Props & { isOpen?: boolean }) => (
  <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
    <ModalContent
      className="max-w-2xl"
      title="Add Account"
      subTitle="Select a resource to add an account under."
      bodyClassName="overflow-visible"
    >
      <Content accountId={accountId} onOpenChange={onOpenChange} />
    </ModalContent>
  </Modal>
);
