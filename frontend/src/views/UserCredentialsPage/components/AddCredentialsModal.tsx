import { useEffect, useState } from "react";
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

import { readableCredentialKind } from "../util";

export type CredentialsPopup = ["credential"]

type CredentialModalProps = {
  popUp: UsePopUpState<["credential"]>,
  handlePopUpToggle: UsePopUpReturn<CredentialsPopup>["handlePopUpToggle"];
  credentialToEdit?: TUserCredential;
  onEditDone?: () => void;
  onCredentialAdded: (credential: TUserCredential) => void;
}

const credentialSchema = yup.object({
  kind: yup.mixed().oneOf(Object.values(CredentialKind)).required(),
  name: yup.string().required(),

  // Secure Note
  note: yup.string().when("kind", {
    is: CredentialKind.secureNote,
    then: yup.string().required(),
    otherwise: yup.string().notRequired(),
  }),

  // Login
  website: yup.string().when("kind", {
    is: CredentialKind.login,
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
}).required();

export type FormData = yup.InferType<typeof credentialSchema>;

type Control<T extends FieldValues> = ReturnType<typeof useForm<T>>["control"]

function FormInputField({
  control, name, label,
  placeholder, type = "text",
}: {
  control: Control<FormData>,
  name: FieldPath<FormData>,
  label: string,
  type?: string,
  placeholder?: string
}) {
  return <Controller
    control={control}
    name={name}
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


function LoginFields({ control }: { control: Control<FormData> }) {
  return (
    <>
      <FormInputField
        control={control}
        name="website" label="Website"
        placeholder="example.com"
      />
      <FormInputField control={control}
        name="username" label="Username"
        placeholder="example@email.com"
      />
      <FormInputField control={control}
        name="password" label="Password"
        type="password"
      />
    </>
  );
}

export function CredentialModal(
  {
    popUp,
    handlePopUpToggle,
    credentialToEdit,
    onEditDone,
    onCredentialAdded,
  }: CredentialModalProps
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
    // formState: { isSubmitting },
    setValue,
  } = useForm<FormData>({
    resolver: yupResolver(credentialSchema),
  });

  // Reset form when the credential being edited changes
  useEffect(() => {
    reset();
    if (credentialToEdit) {
      setCredentialKind(credentialToEdit.kind);
      reset({
        ...credentialToEdit,
      })
    } else {
      reset({ kind: credentialKind });
    }
  }, [credentialToEdit, reset]);

  const getCredentialFromFormData = (formData: FormData) => {
    let credential: TUserCredential;
    if (formData.kind === CredentialKind.login) {
      credential = {
        kind: CredentialKind.login,
        website: formData.website!,
        username: formData.username!,
        password: formData.password!,
        name: formData.name,
      };
    } else {
      credential = {
        kind: CredentialKind.secureNote,
        note: formData.note!,
        name: formData.name!,
      }
    }
    return credential;
  }

  const onFormSubmit = async (formData: FormData) => {
    const credential = getCredentialFromFormData(formData);
    // If we're editing a credential, we need to set the credentialId
    // so that the backend performs an upsert.
    credential.credentialId = credentialToEdit?.credentialId;

    try {
      const orgId = organization?.currentOrg?.id;
      if (orgId) {
        const addedCredential = await createCredential.mutateAsync({
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

        onCredentialAdded(addedCredential);
      }
    } catch (error) {
      const action = credentialToEdit ? "update" : "add";
      createNotification({
        title: `Failed to ${action} credential`,
        text: error instanceof Error ? error.message : "Unknown error",
        type: "error"
      });
    }
  };

  return <Modal
    isOpen={popUp.credential.isOpen}
    onOpenChange={(isOpen) => {
      if (!isOpen && credentialToEdit !== undefined) {
          onEditDone?.();
      }
      handlePopUpToggle("credential", isOpen);
    }}
  >
    <ModalContent title={`${credentialToEdit ? "Edit" : "Add"} Credential`} >
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <FormInputField
          control={control}
          name="name"
          label="Name"
          placeholder="Credential Name"
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
                  {Object.values(CredentialKind).map((credKind) => (
                    <SelectItem value={credKind} key={`st-role-${credKind}`}>
                      {readableCredentialKind(credKind)}
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
                return <LoginFields control={control} />
              case CredentialKind.secureNote:
                return <FormInputField
                  control={control}
                  name="note"
                  label="Note"
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
            onClick={() => {
              if (onEditDone) onEditDone();
              handlePopUpToggle("credential", false)
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </ModalContent>
  </Modal >
}

