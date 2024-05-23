// import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
// import { yupResolver } from "@hookform/resolvers/yup";
// import * as yup from "yup";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { CertificateAuthorityType, useCreateCa } from "@app/hooks/api/ca";
// import { useCreateIdentity, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    type: z.enum(["root", "intermediate"]), // move to ref enum of hooks/api
    organization: z.string(),
    ou: z.string(),
    country: z.string(),
    province: z.string(),
    locality: z.string(),
    commonName: z.string()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["ca"]>;
  //   handlePopUpOpen: (
  //     popUpName: keyof UsePopUpState<["identityAuthMethod"]>,
  //     data: {
  //       identityId: string;
  //       name: string;
  //       authMethod?: IdentityAuthMethod;
  //     }
  //   ) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["ca"]>, state?: boolean) => void;
};

const caTypes = [
  { label: "Root", value: CertificateAuthorityType.ROOT },
  { label: "intermediate", value: CertificateAuthorityType.INTERMEDIATE }
];

export const CaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  console.log("CaModal currentWorkspace: ", currentWorkspace);

  const { mutateAsync: createMutateAsync } = useCreateCa();
  //   const { data: roles } = useGetOrgRoles(orgId);
  //   const { mutateAsync: createMutateAsync } = useCreateIdentity();
  //   const { mutateAsync: updateMutateAsync } = useUpdateIdentity();
  // const { mutateAsync: addMutateAsync } = useAddIdentityUniversalAuth();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: CertificateAuthorityType.ROOT,
      organization: "",
      ou: "",
      country: "",
      province: "",
      locality: "",
      commonName: ""
    }
  });

  //   useEffect(() => {
  //     const identity = popUp?.identity?.data as {
  //       identityId: string;
  //       name: string;
  //       role: string;
  //       customRole: {
  //         name: string;
  //         slug: string;
  //       };
  //     };

  //     if (!roles?.length) return;

  //     if (identity) {
  //       reset({
  //         name: identity.name,
  //         role: identity?.customRole?.slug ?? identity.role
  //       });
  //     } else {
  //       reset({
  //         name: "",
  //         role: roles[0].slug
  //       });
  //     }
  //   }, [popUp?.identity?.data, roles]);

  const onFormSubmit = async ({
    type,
    commonName,
    organization,
    ou,
    country,
    locality,
    province
  }: FormData) => {
    try {
      console.log("onFormSubmit args: ", {
        commonName,
        organization,
        ou,
        country,
        locality,
        province
      });

      if (!currentWorkspace?.slug) return;

      await createMutateAsync({
        projectSlug: currentWorkspace.slug,
        type,
        commonName,
        organization,
        ou,
        country,
        province,
        locality
      });

      //   const identity = popUp?.identity?.data as {
      //     identityId: string;
      //     name: string;
      //     role: string;
      //   };

      //   if (identity) {
      //     // update

      //     await updateMutateAsync({
      //       identityId: identity.identityId,
      //       name,
      //       role: role || undefined,
      //       organizationId: orgId
      //     });

      //     handlePopUpToggle("identity", false);
      //   } else {
      //     // create

      //     const {
      //       id: createdId,
      //       name: createdName,
      //       authMethod
      //     } = await createMutateAsync({
      //       name,
      //       role: role || undefined,
      //       organizationId: orgId
      //     });

      //     await addMutateAsync({
      //       organizationId: orgId,
      //       identityId: createdId,
      //       clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      //       accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      //       accessTokenTTL: 2592000,
      //       accessTokenMaxTTL: 2592000,
      //       accessTokenNumUsesLimit: 0
      //     });

      //     handlePopUpToggle("identity", false);
      //     handlePopUpOpen("identityAuthMethod", {
      //       identityId: createdId,
      //       name: createdName,
      //       authMethod
      //     });
      //   }

      createNotification({
        text: `Successfully ${popUp?.ca?.data ? "updated" : "created"} CA`,
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ?? `Failed to ${popUp?.ca?.data ? "update" : "create"} CA`;

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.ca?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("ca", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${popUp?.ca?.data ? "Update" : "Create"} CA`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="type"
            defaultValue={CertificateAuthorityType.ROOT}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="CA Type" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                  //   isDisabled={!!identityAuthMethodData?.authMethod}
                >
                  {caTypes.map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="organization"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Organization (O)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Acme Corp" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="ou"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Organization Unit (OU)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Engineering" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="country"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Country Name (C)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="United States (US)" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="province"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="State or Province Name"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="California" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="locality"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Locality Name"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="San Francisco" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="commonName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Common Name (CN)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Example CA" />
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {popUp?.ca?.data ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("ca", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
