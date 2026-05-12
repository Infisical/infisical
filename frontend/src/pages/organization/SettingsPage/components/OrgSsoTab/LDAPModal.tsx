import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  DocumentationLinkBadge,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea
} from "@app/components/v3";
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
  url: z.string().trim().min(1, "URL is required"),
  bindDN: z.string().trim().min(1, "Bind DN is required"),
  bindPass: z.string().min(1, "Bind Pass is required"),
  searchBase: z.string().trim().min(1, "User Search Base is required"),
  groupSearchBase: z.string().default(""),
  searchFilter: z.string().default(""),
  uniqueUserAttribute: z.string().default(""),
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
  const [isBindPassFocused, setIsBindPassFocused] = useToggle();

  const handleLdapSoftDelete = async () => {
    if (!currentOrg) {
      return;
    }
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
      text: "Successfully deleted LDAP configuration.",
      type: "success"
    });
  };

  const watchUrl = watch("url");
  const watchBindDN = watch("bindDN");
  const watchBindPass = watch("bindPass");
  const watchCaCert = watch("caCert");

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
    caCert
  }: TLDAPFormData) => {
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

    handlePopUpClose("addLDAP");

    createNotification({
      text: `Successfully ${!data ? "added" : "updated"} LDAP configuration`,
      type: "success"
    });
  };

  const handleTestLDAPConnection = async () => {
    try {
      const isConnected = await testLDAPConnection({
        url: watchUrl,
        bindDN: watchBindDN,
        bindPass: watchBindPass,
        caCert: watchCaCert ?? ""
      });

      if (isConnected) {
        createNotification({
          text: "Successfully tested the LDAP connection: Bind operation was successful",
          type: "success"
        });
      } else {
        createNotification({
          text: "Failed to connect to the LDAP server. Verify the URL, bind DN/password, and CA certificate.",
          type: "error"
        });
      }
    } catch (err) {
      createNotification({
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Failed to test LDAP connection.",
        type: "error"
      });
    }
  };

  const isPending = createIsLoading || updateIsLoading;
  const isExistingConfig = Boolean(data?.url);

  return (
    <>
      <Sheet
        open={popUp?.addLDAP?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addLDAP", isOpen);
          reset();
        }}
      >
        <SheetContent className="sm:max-w-xl">
          <form onSubmit={handleSubmit(onSSOModalSubmit)} className="flex h-full min-h-0 flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-x-2">
                Manage LDAP Configuration
                <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
              </SheetTitle>
            </SheetHeader>
            <div className="flex thin-scrollbar flex-1 flex-col overflow-y-auto px-4">
              <FieldGroup className="mb-auto">
                <Controller
                  control={control}
                  name="url"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-url">URL</FieldLabel>
                      <Input
                        id="ldap-url"
                        placeholder="ldaps://ldap.myorg.com:636"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="bindDN"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-bind-dn">Bind DN</FieldLabel>
                      <Input
                        id="ldap-bind-dn"
                        placeholder="cn=infisical,ou=Users,dc=example,dc=com"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="bindPass"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-bind-pass">Bind Pass</FieldLabel>
                      <Input
                        id="ldap-bind-pass"
                        placeholder="********"
                        type={isBindPassFocused ? "text" : "password"}
                        autoComplete="off"
                        isError={Boolean(error)}
                        onFocus={() => setIsBindPassFocused.on()}
                        {...field}
                        onBlur={() => {
                          field.onBlur();
                          setIsBindPassFocused.off();
                        }}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="searchBase"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-search-base">User Search Base / User DN</FieldLabel>
                      <Input
                        id="ldap-search-base"
                        placeholder="ou=people,dc=acme,dc=com"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="uniqueUserAttribute"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-unique-user-attribute">
                        Unique User Attribute (Optional)
                      </FieldLabel>
                      <Input
                        id="ldap-unique-user-attribute"
                        placeholder="uidNumber"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="searchFilter"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-search-filter">
                        User Search Filter (Optional)
                      </FieldLabel>
                      <Input
                        id="ldap-search-filter"
                        placeholder="(uid={{username}})"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="groupSearchBase"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-group-search-base">
                        Group Search Base / Group DN (Optional)
                      </FieldLabel>
                      <Input
                        id="ldap-group-search-base"
                        placeholder="ou=groups,dc=acme,dc=com"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="groupSearchFilter"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-group-search-filter">
                        Group Filter (Optional)
                      </FieldLabel>
                      <Input
                        id="ldap-group-search-filter"
                        placeholder="(&(objectClass=posixGroup)(memberUid={{.Username}}))"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="caCert"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="ldap-ca-cert">CA Certificate</FieldLabel>
                      <TextArea
                        id="ldap-ca-cert"
                        placeholder="-----BEGIN CERTIFICATE----- ..."
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FieldGroup>
              <Button
                type="button"
                variant="outline"
                isFullWidth
                size="lg"
                className="my-4"
                onClick={handleTestLDAPConnection}
                isDisabled={!watchUrl || !watchBindDN || !watchBindPass}
              >
                Test Connection
              </Button>
            </div>
            <SheetFooter className="justify-between border-t">
              <div className="flex gap-2">
                <Button type="submit" variant="org" isPending={isPending}>
                  {isExistingConfig ? "Update" : "Configure LDAP"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => handlePopUpClose("addLDAP")}>
                  Cancel
                </Button>
              </div>
              {!hideDelete && (
                <Button type="button" variant="danger" onClick={() => setIsDeletePopupOpen.on()}>
                  Delete
                </Button>
              )}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isDeletePopupOpen} onOpenChange={() => setIsDeletePopupOpen.toggle()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete LDAP Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the LDAP connection. Members will no longer be able to sign in via LDAP
              until it&apos;s reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleLdapSoftDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
