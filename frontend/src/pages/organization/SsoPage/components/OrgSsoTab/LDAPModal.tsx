import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  FormControl,
  Input,
  Modal,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  useCreateLDAPConfig,
  useGetLDAPConfig,
  useTestLDAPConnection,
  useUpdateLDAPConfig
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const LDAPFormSchema = z.object({
  url: z.string().default(""),
  bindDN: z.string().default(""),
  bindPass: z.string().default(""),
  searchBase: z.string().default(""),
  searchFilter: z.string().default(""),
  uniqueUserAttribute: z.string().default(""),
  groupSearchBase: z.string().default(""),
  groupSearchFilter: z.string().default(""),
  caCert: z.string().optional()
});

export type TLDAPFormData = z.infer<typeof LDAPFormSchema>;

type Props = {
  popUp: UsePopUpState<["addLDAP"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addLDAP"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addLDAP"]>, state?: boolean) => void;
  hideDelete?: boolean;
};

export const LDAPModal = ({ popUp, handlePopUpClose, handlePopUpToggle, hideDelete }: Props) => {
  const { currentOrg } = useOrganization();

  const { mutateAsync: createMutateAsync, isPending: createIsLoading } = useCreateLDAPConfig();
  const { mutateAsync: updateMutateAsync, isPending: updateIsLoading } = useUpdateLDAPConfig();
  const { mutateAsync: testLDAPConnection } = useTestLDAPConnection();
  const { data } = useGetLDAPConfig(currentOrg?.id ?? "");

  const { control, handleSubmit, reset, watch } = useForm<TLDAPFormData>({
    resolver: zodResolver(LDAPFormSchema)
  });

  const [isDeletePopupOpen, setIsDeletePopupOpen] = useToggle();

  const handleLdapSoftDelete = async () => {
    if (!currentOrg) {
      return;
    }
    try {
      await updateMutateAsync({
        organizationId: currentOrg.id,
        isActive: false,
        url: "",
        bindDN: "",
        bindPass: "",
        searchBase: "",
        searchFilter: "",
        uniqueUserAttribute: "",
        groupSearchBase: "",
        groupSearchFilter: "",
        caCert: ""
      });

      createNotification({
        text: "Successfully deleted OIDC configuration.",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed deleting OIDC configuration.",
        type: "error"
      });
    }
  };

  const watchUrl = watch("url");
  const watchBindDN = watch("bindDN");
  const watchBindPass = watch("bindPass");
  const watchSearchBase = watch("searchBase");
  const watchSearchFilter = watch("searchFilter");
  const watchGroupSearchBase = watch("groupSearchBase");
  const watchGroupSearchFilter = watch("groupSearchFilter");
  const watchCaCert = watch("caCert");
  const watchUniqueUserAttribute = watch("uniqueUserAttribute");

  useEffect(() => {
    if (data) {
      reset({
        url: data?.url ?? "",
        bindDN: data?.bindDN ?? "",
        bindPass: data?.bindPass ?? "",
        searchBase: data?.searchBase ?? "",
        searchFilter: data?.searchFilter ?? "",
        groupSearchBase: data?.groupSearchBase ?? "",
        groupSearchFilter: data?.groupSearchFilter ?? "",
        caCert: data?.caCert ?? "",
        uniqueUserAttribute: data?.uniqueUserAttribute ?? ""
      });
    }
  }, [data]);

  const onSSOModalSubmit = async ({
    url,
    bindDN,
    bindPass,
    uniqueUserAttribute,
    searchBase,
    searchFilter,
    groupSearchBase,
    groupSearchFilter,
    caCert,
    shouldCloseModal = true
  }: TLDAPFormData & { shouldCloseModal?: boolean }) => {
    try {
      if (!currentOrg) return;

      if (!data) {
        await createMutateAsync({
          organizationId: currentOrg.id,
          isActive: false,
          url,
          bindDN,
          bindPass,
          searchBase,
          searchFilter,
          uniqueUserAttribute,
          groupSearchBase,
          groupSearchFilter,
          caCert
        });
      } else {
        await updateMutateAsync({
          organizationId: currentOrg.id,
          isActive: false,
          url,
          bindDN,
          bindPass,
          searchBase,
          searchFilter,
          uniqueUserAttribute,
          groupSearchBase,
          groupSearchFilter,
          caCert
        });
      }

      if (shouldCloseModal) {
        handlePopUpClose("addLDAP");
      }

      createNotification({
        text: `Successfully ${!data ? "added" : "updated"} LDAP configuration`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${!data ? "add" : "update"} LDAP configuration`,
        type: "error"
      });
    }
  };

  const handleTestLDAPConnection = async () => {
    try {
      await onSSOModalSubmit({
        url: watchUrl,
        bindDN: watchBindDN,
        bindPass: watchBindPass,
        searchBase: watchSearchBase,
        searchFilter: watchSearchFilter,
        groupSearchBase: watchGroupSearchBase,
        groupSearchFilter: watchGroupSearchFilter,
        uniqueUserAttribute: watchUniqueUserAttribute,
        caCert: watchCaCert,
        shouldCloseModal: false
      });

      if (!data) return;

      const result = await testLDAPConnection(data.id);

      if (!result) {
        createNotification({
          text: "Failed to test the LDAP connection: Bind operation was unsuccessful",
          type: "error"
        });
        return;
      }

      createNotification({
        text: "Successfully tested the LDAP connection: Bind operation was successful",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to test the LDAP connection",
        type: "error"
      });
    }
  };

  return (
    <>
      <Modal
        isOpen={popUp?.addLDAP?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addLDAP", isOpen);
          reset();
        }}
      >
        <ModalContent title="Manage LDAP configuration">
          <form onSubmit={handleSubmit(onSSOModalSubmit)}>
            <Controller
              control={control}
              name="url"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="URL" errorText={error?.message} isError={Boolean(error)}>
                  <Input {...field} placeholder="ldaps://ldap.myorg.com:636" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="bindDN"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Bind DN" errorText={error?.message} isError={Boolean(error)}>
                  <Input {...field} placeholder="cn=infisical,ou=Users,dc=example,dc=com" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="bindPass"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Bind Pass" errorText={error?.message} isError={Boolean(error)}>
                  <Input {...field} type="password" placeholder="********" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="searchBase"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="User Search Base / User DN"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Input {...field} placeholder="ou=people,dc=acme,dc=com" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="uniqueUserAttribute"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Unique User Attribute (Optional)"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Input {...field} placeholder="uidNumber" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="searchFilter"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="User Search Filter (Optional)"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Input {...field} placeholder="(uid={{username}})" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="groupSearchBase"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Group Search Base / Group DN (Optional)"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Input {...field} placeholder="ou=groups,dc=acme,dc=com" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="groupSearchFilter"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Group Filter (Optional)"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Input
                    {...field}
                    placeholder="(&(objectClass=posixGroup)(memberUid={{.Username}}))"
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="caCert"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="CA Certificate"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
                </FormControl>
              )}
            />
            <div className="mt-8 flex justify-between">
              <div className="flex items-center">
                <Button
                  className="mr-4"
                  size="sm"
                  type="submit"
                  isLoading={createIsLoading || updateIsLoading}
                >
                  {!data ? "Add" : "Update"}
                </Button>
                <Button colorSchema="secondary" onClick={handleTestLDAPConnection}>
                  Test Connection
                </Button>
              </div>
              {!hideDelete && (
                <Button colorSchema="danger" onClick={() => setIsDeletePopupOpen.on()}>
                  Delete
                </Button>
              )}
            </div>
          </form>
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={isDeletePopupOpen}
        title="Are you sure want to delete LDAP?"
        onChange={() => setIsDeletePopupOpen.toggle()}
        deleteKey="confirm"
        onDeleteApproved={handleLdapSoftDelete}
      />
    </>
  );
};
