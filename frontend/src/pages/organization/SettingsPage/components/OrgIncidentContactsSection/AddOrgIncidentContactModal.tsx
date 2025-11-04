import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useAddIncidentContact } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { UsePopUpState } from "@app/hooks/usePopUp";

const addContactFormSchema = z.object({
  email: z.string().email().trim()
});

type TAddContactForm = z.infer<typeof addContactFormSchema>;

type Props = {
  popUp: UsePopUpState<["addContact"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addContact"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addContact"]>, state?: boolean) => void;
};

export const AddOrgIncidentContactModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle
}: Props) => {
  const { currentOrg } = useOrganization();
  const { data: serverDetails } = useFetchServerStatus();
  const { control, handleSubmit, reset } = useForm<TAddContactForm>({
    resolver: zodResolver(addContactFormSchema)
  });

  const { mutateAsync, isPending } = useAddIncidentContact();

  const onFormSubmit = async ({ email }: TAddContactForm) => {
    if (!currentOrg?.id) return;

    await mutateAsync({
      orgId: currentOrg.id,
      email
    });

    createNotification({
      text: "Successfully added incident contact",
      type: "success"
    });

    if (serverDetails?.emailConfigured) {
      handlePopUpClose("addContact");
    }

    reset();
  };

  return (
    <Modal
      isOpen={popUp?.addContact?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addContact", isOpen);
        reset();
      }}
    >
      <ModalContent
        title="Add an Incident Contact"
        subTitle="This contact will be notified in the unlikely event of a severe incident."
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="email"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Email" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} />
              </FormControl>
            )}
          />
          <div className="mt-8 flex items-center space-x-4">
            <Button size="sm" type="submit" isLoading={isPending} isDisabled={isPending}>
              Add Incident Contact
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpClose("addContact")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
