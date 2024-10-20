import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import {
  useOrganization,
  useUser
} from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useCreateUserCredentials } from "@app/hooks/api"; // Replace with the correct path to your hook

const credentialTypeOptions = [
  { label: "Web Login", value: "WEB_LOGIN" },
  { label: "Credit Card", value: "CREDIT_CARD" },
  { label: "Secure Note", value: "SECURE_NOTE" }
];

const schema = z.object({
  credentialType: z.enum(["WEB_LOGIN", "CREDIT_CARD", "SECURE_NOTE"]),
  username: z.string().optional(),
  password: z.string().optional(),
  cardNumber: z.string().optional().refine((val) => !val || /^\d{16}$/.test(val), {
    message: "Card number must be exactly 16 digits"
  }),
  expiryDate: z.string().optional().refine((val) => !val || /^(0[1-9]|1[0-2])\/?([0-9]{2})$/.test(val), {
    message: "Expiry date must be in MM/YY format"
  }),
  cvv: z.string().optional().refine((val) => !val || val.length === 3, {
    message: "CVV must be exactly 3 digits"
  }),
  title: z.string().optional(),
  content: z.string().optional(),
  organizationId: z.string().optional(),
  userId: z.string().optional(),
});




export type FormData = z.infer<typeof schema>;


type Props = {
  closeModal:()=>void
};

export const AddUserSecretsForm = ({ closeModal}: Props) => {
  const [secretLink, setSecretLink] = useState("");
  const { currentOrg } = useOrganization();
  const { user } = useUser();

  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const {
    control,
    watch,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      credentialType: "WEB_LOGIN"
    }
  });

  const { mutateAsync: createUserCredentials } = useCreateUserCredentials()
  const currentOrgId = currentOrg?.id || ''
  const userId = user?.id || ''

  const credentialType = watch("credentialType");

  const onFormSubmit = async (data: FormData) => {
    try {
      await createUserCredentials({...data, 
        organizationId:currentOrgId ,
        userId});

      createNotification({
        text: "Successfully created a credential",
        type: "success"
      });
      closeModal();
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a credential",
        type: "error"
      });
    }
  };

  const hasSecretLink = Boolean(secretLink);

  return !hasSecretLink ? (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="credentialType"
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl label="Credential Type" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={value}
              onValueChange={onChange}
              className="w-full"
            >
              {credentialTypeOptions.map(({ label, value: credentialValue }) => (
                <SelectItem value={credentialValue} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
       <Controller
            control={control}
            name="title"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Title"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="Enter identity name" type="text" />
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
                isRequired
              >
                <Input {...field} placeholder="Enter Username" type="text" />
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
                isRequired
              >
                <Input {...field} placeholder="Enter Password" type="password" />
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
                isRequired
              >
                <Input {...field} placeholder="Enter Card Number" type="text" />
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
                isRequired
              >
                <Input {...field} placeholder="MM/YY" type="text" />
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
                isRequired
              >
                <Input {...field} placeholder="Enter CVV" type="password" />
              </FormControl>
            )}
          />
        </>
      )}

      {credentialType === "SECURE_NOTE" && (
        <>
          <Controller
            control={control}
            name="content"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Content"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <textarea
                  placeholder="Enter sensitive note content..."
                  {...field}
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
        Create Credential
      </Button>
    </form>
  ) : (
    <>
      <div className="mr-2 flex items-center justify-end rounded-md bg-white/[0.05] p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{secretLink}</p>
        <IconButton
          ariaLabel="copy icon"
          colorSchema="secondary"
          className="group relative ml-2"
          onClick={() => {
            navigator.clipboard.writeText(secretLink);
            setCopyTextSecret("Copied");
          }}
        >
          <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} />
        </IconButton>
      </div>
      <Button
        className="mt-4 w-full bg-mineshaft-700 py-3 text-bunker-200"
        colorSchema="primary"
        variant="outline_bg"
        size="sm"
        onClick={() => setSecretLink("")}
        rightIcon={<FontAwesomeIcon icon={faRedo} className="pl-2" />}
      >
        Create another credential
      </Button>
    </>
  );
};
