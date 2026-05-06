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
import { TEmailDomain, useCreateEmailDomain } from "@app/hooks/api";
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
  onCreated?: (emailDomain: TEmailDomain) => void;
};

export const AddEmailDomainModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle,
  onCreated
}: Props) => {
  const { control, handleSubmit, reset } = useForm<TAddDomainForm>({
    resolver: zodResolver(addDomainFormSchema)
  });

  const { mutateAsync: createEmailDomain, isPending } = useCreateEmailDomain();

  const onFormSubmit = async ({ domain }: TAddDomainForm) => {
    try {
      const emailDomain = await createEmailDomain({ domain });
      createNotification({
        text: "Email domain added. Follow the DNS verification steps to complete setup.",
        type: "success"
      });
      handlePopUpClose("addDomain");
      reset();
      onCreated?.(emailDomain);
    } catch (error) {
      createNotification({
        text: (error as Error)?.message || "Failed to add email domain",
        type: "error"
      });
    }
  };

  return (
    <Dialog
      open={popUp?.addDomain?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addDomain", isOpen);
        reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add email domain</DialogTitle>
          <DialogDescription>Add a domain to verify ownership via DNS.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            defaultValue=""
            name="domain"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="domain">Domain</FieldLabel>
                <Input id="domain" placeholder="company.com" isError={Boolean(error)} {...field} />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => handlePopUpClose("addDomain")}>
              Cancel
            </Button>
            <Button variant="org" type="submit" isPending={isPending} isDisabled={isPending}>
              Add Domain
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
