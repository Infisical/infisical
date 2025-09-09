import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";
import { useUpdateUserEmail } from "@app/hooks/api/users";
import { clearSession } from "@app/hooks/api/users/queries";

const schema = z
  .object({
    newEmail: z.string().email("Please enter a valid email")
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const ChangeEmailSection = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const { reset, control, handleSubmit } = useForm({
    defaultValues: {
      newEmail: ""
    },
    resolver: zodResolver(schema)
  });

  const { mutateAsync: updateUserEmail, isPending: isLoading } = useUpdateUserEmail();

  const onFormSubmit = async ({ newEmail }: FormData) => {
    if (newEmail.toLowerCase() === user?.email?.toLowerCase()) {
      createNotification({
        text: "New email must be different from current email",
        type: "error"
      });
      return;
    }

    setPendingEmail(newEmail);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmEmailChange = async () => {
    try {
      await updateUserEmail({ newEmail: pendingEmail });

      createNotification({
        text: "Email updated successfully. You will be redirected to login.",
        type: "success"
      });

      setIsConfirmModalOpen(false);
      reset();

      // Clear frontend session/token to ensure proper logout
      clearSession(true); // Keep query client to show the success notification

      // Redirect to login after a short delay
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setIsConfirmModalOpen(false);

      const errorMessage = err?.response?.data?.message || "Failed to update email";
      createNotification({
        text: errorMessage,
        type: "error"
      });
    }
  };

  return (
    <>
      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      >
        <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">Change email</h2>
        <div className="max-w-md">
          <Controller
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl label="New email" isError={Boolean(error)} errorText={error?.message}>
                <Input
                  placeholder="Enter new email address"
                  type="email"
                  {...field}
                  className="bg-mineshaft-800"
                />
              </FormControl>
            )}
            control={control}
            name="newEmail"
          />
        </div>
        <Button
          type="submit"
          colorSchema="secondary"
          isLoading={isLoading}
          isDisabled={isLoading}
          className="mt-4"
        >
          Change Email
        </Button>
        <p className="mt-2 font-inter text-sm text-mineshaft-400">
          After changing your email, you&apos;ll need to verify it and sign in again.
        </p>
      </form>

      <DeleteActionModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onChange={setIsConfirmModalOpen}
        deleteKey="confirm"
        title="Confirm Email Change"
        subTitle="This action will log you out of all sessions and require email verification."
        buttonText="Change Email"
        buttonColorSchema="danger"
        onDeleteApproved={handleConfirmEmailChange}
      />
    </>
  );
};
