import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";

const formSchema = z.object({
  ticketSystem: z.string().min(1, "Ticket system is required"),
  summary: z.string().trim().min(1, "Summary is required"),
  priority: z.string().default("Medium"),
  assignee: z.string().optional()
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CreateTicketModal = ({ isOpen, onOpenChange }: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priority: "Medium"
    }
  });

  const onFormSubmit = () => {
    createNotification({ text: "Ticket created successfully.", type: "success" });
    reset();
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <ModalContent title="Create Ticket" subTitle="Create a ticket in your connected system.">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="ticketSystem"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Ticket System"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Select
                  {...field}
                  onValueChange={onChange}
                  className="w-full"
                  placeholder="Select system"
                >
                  {["Jira Cloud - INFRA", "ServiceNow - SEC", "Linear - Crypto Team"].map((v) => (
                    <SelectItem value={v} key={v}>
                      {v}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="summary"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Summary"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Brief description of the issue" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="priority"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Priority" isError={Boolean(error)} errorText={error?.message}>
                <Select {...field} onValueChange={onChange} className="w-full">
                  {["Critical", "High", "Medium", "Low"].map((v) => (
                    <SelectItem value={v} key={v}>
                      {v}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="assignee"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Assignee" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="Optional assignee email" />
              </FormControl>
            )}
          />
          <div className="mt-7 flex items-center">
            <Button
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
              className="mr-4"
            >
              Create Ticket
            </Button>
            <Button
              variant="plain"
              colorSchema="secondary"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
