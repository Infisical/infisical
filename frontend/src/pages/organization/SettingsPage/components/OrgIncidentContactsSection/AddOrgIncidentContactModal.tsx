import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
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
    <Dialog
      open={popUp?.addContact?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addContact", isOpen);
        reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an Incident Contact</DialogTitle>
          <DialogDescription>
            This contact will be notified in the unlikely event of a severe incident.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            defaultValue=""
            name="email"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="incident-contact-email">Email</FieldLabel>
                <Input
                  id="incident-contact-email"
                  placeholder="contact@acme.com"
                  isError={Boolean(error)}
                  {...field}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => handlePopUpClose("addContact")}>
              Cancel
            </Button>
            <Button variant="org" type="submit" isPending={isPending} isDisabled={isPending}>
              Add Incident Contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
