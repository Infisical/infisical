import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton,Input, Select, SelectItem } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { useUpdateCredential } from "@app/hooks/api";

// Credential Types
const credentialTypeOptions = [
  { label: "Web Login", value: "WEB_LOGIN" },
  { label: "Credit Card", value: "CREDIT_CARD" },
  { label: "Secure Note", value: "SECURE_NOTE" }
];

// Zod Schema for validation
const schema = z.object({
  credentialType: z.enum(["WEB_LOGIN", "CREDIT_CARD", "SECURE_NOTE"]),
  username: z.string().optional(),
  password: z.string().optional(),
  cardNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  cvv: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  initialData: FormData; // initial values for editing
};

export const EditUserSecretsForm = ({ initialData }: Props) => {
  const [editLink, setEditLink] = useState("");
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const updateCredential = useUpdateCredential(); // API for updating

  const {
    control,
    reset,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData
  });

  // Watching for changes in credentialType
  const credentialType = watch("credentialType");

  const onFormSubmit = async (formData: FormData) => {
    try {
      // Assuming an API function to update the credential
      await updateCredential.mutateAsync(formData);
      
      setEditLink("Credential updated successfully");
      reset();
      setCopyText("Copied");
      createNotification({
        text: "Successfully updated credential",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to update credential",
        type: "error"
      });
    }
  };

  const hasEditLink = Boolean(editLink);

  return !hasEditLink ? (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="credentialType"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Credential Type" isError={Boolean(error)} errorText={error?.message}>
            <Select {...field} onValueChange={(e) => onChange(e)} className="w-full">
              {credentialTypeOptions.map(({ label, value }) => (
                <SelectItem value={value} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />

      {credentialType === "WEB_LOGIN" && (
        <>
          <Controller
            control={control}
            name="username"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Username"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Enter your username" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Password"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Enter your password" type="password" />
              </FormControl>
            )}
          />
        </>
      )}

      {credentialType === "CREDIT_CARD" && (
        <>
          <Controller
            control={control}
            name="cardNumber"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Card Number"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Enter your card number" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="expiryDate"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Expiry Date"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="MM/YY" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="cvv"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="CVV"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="CVV" />
              </FormControl>
            )}
          />
        </>
      )}

      {credentialType === "SECURE_NOTE" && (
        <>
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Title"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Enter a title for your note" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="content"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Content"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <textarea
                  {...field}
                  placeholder="Enter your secure note content"
                  className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 py-1.5 px-2 text-bunker-300 outline-none transition-all placeholder:text-mineshaft-400 hover:border-primary-400/30 focus:border-primary-400/50"
                />
              </FormControl>
            )}
          />
        </>
      )}

      <Button
        className="mt-4"
        size="sm"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting}
      >
        Update Credential
      </Button>
    </form>
  ) : (
    <>
      <div className="mr-2 flex items-center justify-end rounded-md bg-white/[0.05] p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{editLink}</p>
        <IconButton
          ariaLabel="copy icon"
          colorSchema="secondary"
          className="group relative ml-2"
          onClick={() => {
            navigator.clipboard.writeText(editLink);
            setCopyText("Copied");
          }}
        >
          <FontAwesomeIcon icon={isCopying ? faCheck : faRedo} />
        </IconButton>
      </div>
      <Button
        className="mt-4 w-full bg-mineshaft-700 py-3 text-bunker-200"
        colorSchema="primary"
        variant="outline_bg"
        size="sm"
        onClick={() => setEditLink("")}
        rightIcon={<FontAwesomeIcon icon={faRedo} className="pl-2" />}
      >
        Edit another credential
      </Button>
    </>
  );
};
