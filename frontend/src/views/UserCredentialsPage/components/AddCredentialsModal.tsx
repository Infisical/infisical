import { useState } from "react";
import { Controller, FieldPath, FieldValues, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
} from "@app/components/v2";
import { useOrganization, useUser } from "@app/context";
import { useCreateCredential } from "@app/hooks/api/userCredentials/mutation";
import { CredentialKind, TUserCredential } from "@app/hooks/api/userCredentials/types";
import { UsePopUpReturn, UsePopUpState } from "@app/hooks/usePopUp";

import { Login, SecureNote } from "./UserCredentialsTable";

export type CredentialsPopup = ["credential"]

type CreateCredentialModalProps = {
  popUp: UsePopUpState<["credential"]>,
  handlePopUpToggle: UsePopUpReturn<CredentialsPopup>["handlePopUpToggle"];
  credentialToEdit?: TUserCredential;
}

const schema = yup.object({
  kind: yup.mixed().oneOf(Object.values(CredentialKind)).required(),
  name: yup.string().required(),

  // Secure Note
  note: yup.string().when("kind", {
    is: CredentialKind.secureNote,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  // Login
  url: yup.string().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  username: yup.string().when("kind", {
    is: CredentialKind.login,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  password: yup.string().when("kind", {
    is: CredentialKind.login,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  // Credit card
  cardNumber: yup.string().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
    // some people might enter spaces in their credit card numbers.
  }).transform(v => v.replaceAll(" ", "d")),

  expiry: yup.date().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.date().default(new Date()).required(),
    otherwise: yup.date().notRequired(),
  }),

  cvv: yup.string().when("kind", {
    is: CredentialKind.creditCard,
    then: yup.string().length(3).matches(/\d{3}/).required(),
    otherwise: yup.string().notRequired(),
  }),
}).required();

export type FormData = yup.InferType<typeof schema>;

type Control<T extends FieldValues> = ReturnType<typeof useForm<T>>["control"]

function FormInputField({
  control,
  name,
  label,
  placeholder,
  type = "text",
  defaultValue
}: {
  control: Control<FormData>,
  name: FieldPath<FormData>,
  label: string,
  type?: string,
  placeholder?: string
  defaultValue?: string
}) {
  return <Controller
    control={control}
    name={name}
    defaultValue={defaultValue}
    render={({ field, fieldState: { error } }) =>
    (
      <FormControl
        className="mt-4"
        label={label}
        isError={Boolean(error)}
        errorText={error?.message}
      >
        <Input
          {...field}
          type={type}
          placeholder={placeholder}
        />
      </FormControl>
    )
    } />
}

function CreditCardFields({ control }: { control: Control<FormData> }) {
  return (
    <>
      <FormInputField control={control} name="cardNumber" label="Card Number" placeholder="1234-XXXX-XXXX-XXXX" />
      <FormInputField control={control} name="cvv" label="CVV" placeholder="000" />
      <FormInputField control={control} name="expiry" label="Expiry Date" type="date" />
    </>
  );
}

function LoginFields({ control, loginToEdit }: { control: Control<FormData>, loginToEdit?: Login }) {
  return (
    <>
      <FormInputField
        control={control}
        name="url" label="Website"
        placeholder="example.com"
        defaultValue={loginToEdit?.website}
      />
      <FormInputField control={control}
        name="username" label="Username"
        placeholder="example@email.com"
        defaultValue={loginToEdit?.username}
      />
      <FormInputField control={control}
        name="password" label="Password"
        type="password"
        defaultValue={loginToEdit?.password}
      />
    </>
  );
}

export function CreateCredentialModal(
  { popUp, handlePopUpToggle, credentialToEdit }: CreateCredentialModalProps
) {
  const [credentialKind, setCredentialKind] = useState(
    credentialToEdit?.kind ?? CredentialKind.login
  );

  const organization = useOrganization();
  const { user } = useUser();
  const createCredential = useCreateCredential();

  const {
    control,
    handleSubmit,
    reset,
    // formState: { isSubmitting }
    setValue,
  } = useForm<FormData>({
    resolver: yupResolver(schema),
  });

  const onFormSubmit = async (formData: FormData) => {
    let credential: TUserCredential;
    if (formData.kind === CredentialKind.login) {
      credential = {
        kind: CredentialKind.login,
        website: formData.url!,
        username: formData.username!,
        password: formData.password!,
        name: formData.name,
      };
    } else if (formData.kind === CredentialKind.creditCard) {
      credential = {
        kind: CredentialKind.creditCard,
        cardNumber: formData.cardNumber!,
        expiry: (Number(formData.expiry!)).toString(),
        cvv: formData.cvv!,
        name: formData.name!,
      }
    } else {
      credential = {
        kind: CredentialKind.secureNote,
        note: formData.note!,
        name: formData.name!,
      }
    }

    credential.id = credentialToEdit?.id;

    try {
      const orgId = organization?.currentOrg?.id;
      if (orgId) {
        await createCredential.mutateAsync({
          orgId,
          credential,
          userId: user.id,
        });

        handlePopUpToggle("credential", false);

        const action = credentialToEdit ? "updated" : "added";
        createNotification({
          text: `Successfully ${action} credential`,
          type: "success"
        });

      } else {
        // TODO(@srijan): Queue to request so it fires when the org is loaded 
      }
    } catch (error) {
      const action = credentialToEdit ? "update" : "add";
      createNotification({
        title: `Failed to ${action} credential`,
        text: error instanceof Error ? error.message : "Unknown error",
        type: "error"
      });
    }
  }

  return <Modal
    isOpen={popUp.credential.isOpen}
    onOpenChange={(isOpen) => {
      handlePopUpToggle("credential", isOpen);
      reset({ kind: credentialKind });
    }}
  >
    <ModalContent title={`${credentialToEdit ? "Edit" : "Add"} Credential`} >
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <FormInputField
          control={control}
          name="name"
          label="Name"
          placeholder="Credential Name"
          defaultValue={credentialToEdit?.name}
        />

        {!credentialToEdit &&
          <Controller
            control={control}
            name="kind"
            defaultValue={credentialKind}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Credential Kind"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(value) => {
                    onChange(value);
                    setValue("kind", value);
                    setCredentialKind(value as CredentialKind);
                  }}
                  className="w-full"
                >
                  {Object.values(CredentialKind).map((name) => (
                    <SelectItem value={name} key={`st-role-${name}`}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />}

        {
          (() => {
            switch (credentialKind) {
              case CredentialKind.login:
                return <LoginFields control={control} loginToEdit={credentialToEdit as Login} />
              case CredentialKind.creditCard:
                return <CreditCardFields control={control} />
              case CredentialKind.secureNote:
                return <FormInputField
                  control={control}
                  name="note"
                  label="Note"
                  defaultValue={credentialToEdit ? (credentialToEdit as SecureNote).note : undefined}
                />
              default:
                // We've covered all cases, but for some reason,
                // TypeScript doesn't do an exhaustiveness check for that.
                console.error("impossible switch case arm")
                return null;
            }
          })()
        }


        <div className="flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            isLoading={false}
            isDisabled={false}
          >
            Save
          </Button>

          <Button
            colorSchema="secondary"
            variant="plain"
            onClick={() => handlePopUpToggle("credential", false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </ModalContent>
  </Modal >
}

