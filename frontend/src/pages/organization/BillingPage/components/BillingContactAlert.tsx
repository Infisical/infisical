import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
import { useUser } from "@app/context";
import { isValidEmail } from "@app/helpers/email";
import { useScopeVariant } from "@app/hooks";
import { useUpdateBillingEmail } from "@app/hooks/api";

const schema = z.object({
  email: z.string().trim().refine(isValidEmail, { message: "Enter a valid email address" })
});

type FormData = z.infer<typeof schema>;

type Props = {
  orgId: string;
  billingEmail: string;
  canManage: boolean;
};

// Stripe sends invoices and failed-payment emails to the billing email only, so one owned by someone who
// left the organization means nobody here sees them.
export const BillingContactAlert = ({ orgId, billingEmail, canManage }: Props) => {
  const { user } = useUser();
  const scopeVariant = useScopeVariant();
  const [isOpen, setIsOpen] = useState(false);
  const updateBillingEmail = useUpdateBillingEmail();

  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: user.email ?? "" }
  });

  const handleOpenChange = (nextIsOpen: boolean) => {
    setIsOpen(nextIsOpen);
    if (!nextIsOpen) reset();
  };

  const onFormSubmit = async ({ email }: FormData) => {
    await updateBillingEmail.mutateAsync({ orgId, email });
    createNotification({ text: `Billing email changed to ${email}`, type: "success" });
    handleOpenChange(false);
  };

  return (
    <>
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>The billing contact is no longer in this organization</AlertTitle>
        <AlertDescription>
          Invoices and payment emails go to {billingEmail}, whose owner has left.
          {canManage
            ? " Change the billing email to someone who can act on them."
            : " Ask an organization admin to change the billing email."}
          {canManage && (
            <div className="mt-3">
              <Button variant="warning" size="sm" onClick={() => setIsOpen(true)}>
                Change Billing Email
              </Button>
            </div>
          )}
        </AlertDescription>
      </Alert>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl" isPending={updateBillingEmail.isPending}>
          <DialogHeader>
            <DialogTitle>Change Billing Email</DialogTitle>
            <DialogDescription>
              Invoices, receipts, and failed-payment emails are sent to this address.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
            <Controller
              control={control}
              name="email"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="billing-email">Billing Email</FieldLabel>
                  <Input
                    {...field}
                    id="billing-email"
                    type="email"
                    placeholder="billing@example.com"
                    isError={Boolean(error)}
                    autoComplete="off"
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={scopeVariant}
                isPending={updateBillingEmail.isPending}
                isDisabled={updateBillingEmail.isPending}
              >
                Change Billing Email
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
