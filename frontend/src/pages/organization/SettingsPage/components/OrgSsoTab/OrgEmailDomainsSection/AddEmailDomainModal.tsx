import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useCreateEmailDomain } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const addDomainFormSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Domain is required")
    .refine((val) => val.includes(".") && !val.startsWith(".") && !val.endsWith("."), {
      message: "Please provide a valid domain name (e.g., company.com)"
    })
});

type TAddDomainForm = z.infer<typeof addDomainFormSchema>;

type Props = {
  popUp: UsePopUpState<["addDomain"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addDomain"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addDomain"]>, state?: boolean) => void;
};

export const AddEmailDomainModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { control, handleSubmit, reset } = useForm<TAddDomainForm>({
    resolver: zodResolver(addDomainFormSchema)
  });

  const { mutateAsync: createEmailDomain, isPending } = useCreateEmailDomain();

  const onFormSubmit = async ({ domain }: TAddDomainForm) => {
    try {
      await createEmailDomain({ domain });
      createNotification({
        text: "Email domain added. Follow the DNS verification steps to complete setup.",
        type: "success"
      });
      handlePopUpClose("addDomain");
      reset();
    } catch (error) {
      createNotification({
        text: (error as Error)?.message || "Failed to add email domain",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.addDomain?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addDomain", isOpen);
        reset();
      }}
    >
      <ModalContent title="Add Email Domain" subTitle="Add a domain to verify ownership via DNS.">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="domain"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Domain" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="company.com" />
              </FormControl>
            )}
          />
          <div className="mt-8 flex items-center space-x-4">
            <Button size="sm" type="submit" isLoading={isPending} isDisabled={isPending}>
              Add Domain
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpClose("addDomain")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
