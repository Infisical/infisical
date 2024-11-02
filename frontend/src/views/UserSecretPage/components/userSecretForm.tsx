import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { useCreateUserSecret, useUpdateUserSecret } from "@app/hooks/api/userSecret";
import { 
  CredentialType, 
  TCreateUserSecretRequest, 
  TCredentialFormData,
} from "@app/hooks/api/userSecret/types";

// Create zod schema based on the credential types
const baseSchema = {
  name: z.string().min(1, "Name is required"),
  type: z.nativeEnum(CredentialType),
  description: z.string().optional()
};

const webLoginSchema = z.object({
  ...baseSchema,
  type: z.literal(CredentialType.WEB_LOGIN),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  website: z.string().url().optional()
});

const creditCardSchema = z.object({
  ...baseSchema,
  type: z.literal(CredentialType.CREDIT_CARD),
  cardNumber: z.string().regex(/^\d{16}$/, "Invalid card number"),
  cardholderName: z.string().min(1, "Cardholder name is required"),
  expiryDate: z.string().regex(/^(0[1-9]|1[0-2])\/([0-9]{2})$/, "Invalid expiry date"),
  cvv: z.string().regex(/^\d{3,4}$/, "Invalid CVV")
});

const secureNoteSchema = z.object({
  ...baseSchema,
  type: z.literal(CredentialType.SECURE_NOTE),
  content: z.string().min(1, "Content is required")
});

const schema = z.discriminatedUnion("type", [
  webLoginSchema,
  creditCardSchema,
  secureNoteSchema
]);

type Props = {
  mode: 'create' | 'edit';
  initialData?: TCredentialFormData;
  secretId?: string;
  onSuccess?: () => void;
};

export const UserSecretForm = ({ mode = 'create', initialData, secretId, onSuccess }: Props) => {
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const createUserSecret = useCreateUserSecret();
  const updateUserSecret = useUpdateUserSecret();

  const {
    control,
    reset,
    watch,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TCredentialFormData>({
    resolver: zodResolver(schema),
    defaultValues: initialData || {
      type: CredentialType.WEB_LOGIN,
      name: "",
      description: ""
    }
  });

  const credentialType = watch("type");

  const onFormSubmit = async (data: TCreateUserSecretRequest) => {
    try {
      const payload: TCreateUserSecretRequest = {
        name: data.name,
        secretType: data.type,
        description: data.description
      };

      if (data.type === CredentialType.WEB_LOGIN) {
        payload.userName = data.username;
        payload.password = data.password;
        payload.website = data.website;
      } else if (data.type === CredentialType.CREDIT_CARD) {
        payload.cardholderName = data.cardholderName;
        payload.expiryDate = data.expiryDate;
        payload.cvv = data.cvv;
        payload.cardNumber = data.cardNumber;
      } else if (data.type === CredentialType.SECURE_NOTE) {
        payload.content = data.content;
        payload.title = data.title;
      }
      
      if (mode === 'edit' && secretId) {
        await updateUserSecret.mutateAsync({
          secretId,
          ...payload
        });
        createNotification({
          text: "Credential updated successfully",
          type: "success"
        });
      } else {
        await createUserSecret.mutateAsync(payload);
        createNotification({
          text: "Credential created successfully",
          type: "success"
        });
      }

      reset();
      onSuccess?.();
    } catch (error) {
      console.error(error);
      createNotification({
        text: `Failed to ${mode} credential`,
        type: "error"
      });
    }
  };

  const renderCredentialFields = () => {
    switch (credentialType) {
      case CredentialType.WEB_LOGIN:
        return (
          <>
            <Controller
              control={control}
              name="username"
              render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
                <FormControl
                      label="Username"
                      isError={Boolean(error)}
                      errorText={error?.message}
                      isRequired children={undefined}                >
                  <Input {...field} placeholder="Username" type="text" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
                <FormControl
                  label="Password"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                  children={undefined}
                >
                  <Input {...field} placeholder="Password" type="password" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="website"
              render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
                <FormControl
                      label="Website"
                      isError={Boolean(error)}
                      errorText={error?.message} children={undefined}                >
                  <Input {...field} placeholder="https://example.com" type="url" />
                </FormControl>
              )}
            />
          </>
        );

      case CredentialType.CREDIT_CARD:
        return (
          <>
            <Controller
              control={control}
              name="cardNumber"
              render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
                <FormControl
                  label="Card Number"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  children={undefined}
                  isRequired
                >
                  <Input {...field} placeholder="1234 5678 9012 3456" type="text" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="cardholderName"
              render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
                <FormControl
                  label="Cardholder Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  children={undefined}
                  isRequired
                >
                  <Input {...field} placeholder="John Doe" type="text" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="expiryDate"
              render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
                <FormControl
                  label="Expiry Date"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  children={undefined}
                  isRequired
                >
                  <Input {...field} placeholder="MM/YY" type="text" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="cvv"
              render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
                <FormControl
                  label="CVV"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  children={undefined}
                  isRequired
                >
                  <Input {...field} placeholder="123" type="password" />
                </FormControl>
              )}
            />
          </>
        );

      case CredentialType.SECURE_NOTE:
        return (
          <Controller
            control={control}
            name="content"
            render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
              <FormControl
                label="Content"
                isError={Boolean(error)}
                errorText={error?.message}
                children={undefined}
                isRequired
              >
                <textarea
                  {...field}
                  placeholder="Enter your secure note..."
                  className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 py-1.5 px-2 text-bunker-300 outline-none transition-all placeholder:text-mineshaft-400 hover:border-primary-400/30 focus:border-primary-400/50"
                />
              </FormControl>
            )}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }: { field: any; fieldState: { error: any } }) => (
          <FormControl
            label="Secret Name"
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
            children={undefined}
          >
            <Input {...field} placeholder="My API Key" type="text" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="type"
        render={({ field: { onChange, value, ...restField }, fieldState: { error } }: { field: { onChange: (value: string) => void; value: string; [key: string]: any }; fieldState: { error: { message?: string } } }) => (
          <FormControl
            label="Credential Type"
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
            children={undefined}
          >
            <Select 
              {...restField}
              value={value}
              onValueChange={onChange}
              position="popper"
              className="w-full min-w-[240px]"
            >
              <SelectItem value={CredentialType.WEB_LOGIN}>Web Login</SelectItem>
              <SelectItem value={CredentialType.CREDIT_CARD}>Credit Card</SelectItem>
              <SelectItem value={CredentialType.SECURE_NOTE}>Secure Note</SelectItem>
            </Select>
          </FormControl>
        )}
      />
      {renderCredentialFields()}
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }: { field: any; fieldState: { error: { message?: string } } }) => (
          <FormControl
            label="Description"
            isError={Boolean(error)}
            errorText={error?.message}
            children={undefined}
            isOptional
          >
            <Input {...field} placeholder="Description of this secret" type="text" />
          </FormControl>
        )}
      />
      <Button
        className="mt-4"
        size="sm"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting}
      >
        {mode === 'edit' ? 'Update' : 'Create'} User Secret
      </Button>
    </form>
  );
};