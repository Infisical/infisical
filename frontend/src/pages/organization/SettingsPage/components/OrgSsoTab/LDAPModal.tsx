import { CSSProperties, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Lottie } from "@app/components/v2/Lottie";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
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

const LDAPFormSchema = z
  .object({
    url: z.string().trim().min(1, "URL is required"),
    bindDN: z.string().trim().min(1, "Bind DN is required"),
    bindPass: z.string().min(1, "Bind Pass is required"),
    searchBase: z.string().trim().min(1, "User Search Base is required"),
    groupSearchBase: z.string().default(""),
    searchFilter: z.string().default(""),
    uniqueUserAttribute: z.string().default(""),
    groupSearchFilter: z.string().default(""),
    caCert: z.string().optional(),
    clientCertificate: z.string().optional(),
    clientKeyCertificate: z.string().optional(),
    hasStoredClientKey: z.boolean().default(false),
    enableMtls: z.boolean().default(false)
  })
  .refine(
    (data) => {
      if (!data.enableMtls) return true;
      const hasCert = Boolean(data.clientCertificate?.trim());
      const hasKey = Boolean(data.clientKeyCertificate?.trim()) || data.hasStoredClientKey;
      return hasCert && hasKey;
    },
    {
      message: "Client Certificate and Client Private Key are required when mTLS is enabled.",
      path: ["clientKeyCertificate"]
    }
  );

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
  const { mutateAsync: testLDAPConnection, isPending: testIsLoading } = useTestLDAPConnection();
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
      caCert: "",
      clientCertificate: "",
      clientKeyCertificate: ""
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
  const watchClientCertificate = watch("clientCertificate");
  const watchClientKeyCertificate = watch("clientKeyCertificate");
  const watchHasStoredClientKey = watch("hasStoredClientKey");
  const watchEnableMtls = watch("enableMtls");

  useEffect(() => {
    if (data) {
      const hasMtls = Boolean(data?.hasClientKeyCertificate) || Boolean(data?.clientCertificate);
      reset({
        url: data?.url ?? "",
        bindDN: data?.bindDN ?? "",
        bindPass: data?.bindPass ?? "",
        searchBase: data?.searchBase ?? "",
        searchFilter: data?.searchFilter ?? "",
        groupSearchBase: data?.groupSearchBase ?? "",
        groupSearchFilter: data?.groupSearchFilter ?? "",
        caCert: data?.caCert ?? "",
        clientCertificate: data?.clientCertificate ?? "",
        clientKeyCertificate: "",
        hasStoredClientKey: Boolean(data?.hasClientKeyCertificate),
        enableMtls: hasMtls,
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
    clientCertificate,
    clientKeyCertificate,
    hasStoredClientKey,
    enableMtls
  }: TLDAPFormData) => {
    if (!currentOrg) return;

    // When mTLS is disabled, send empty strings to clear both server-side values.
    // When enabled: send the cert as-is; omit the key when the user didn't paste a new one
    // and a key is already stored server-side (so the stored key is preserved).
    const certForPayload = enableMtls ? clientCertificate : "";
    let keyForPayload: string | undefined;
    if (!enableMtls) {
      keyForPayload = "";
    } else if (hasStoredClientKey && !clientKeyCertificate?.trim()) {
      keyForPayload = undefined;
    } else {
      keyForPayload = clientKeyCertificate;
    }

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
        caCert,
        clientCertificate: certForPayload,
        clientKeyCertificate: keyForPayload
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
        caCert,
        clientCertificate: certForPayload,
        clientKeyCertificate: keyForPayload
      });
    }

    handlePopUpClose("addLDAP");

    createNotification({
      text: `Successfully ${!data ? "added" : "updated"} LDAP configuration`,
      type: "success"
    });
  };

  const handleTestLDAPConnection = async () => {
    if (watchEnableMtls) {
      if (watchHasStoredClientKey && !watchClientKeyCertificate?.trim()) {
        createNotification({
          text: "Paste the Client Private Key to test the connection. Stored keys are not sent to the browser.",
          type: "warning"
        });
        return;
      }
      if (!watchClientCertificate?.trim() || !watchClientKeyCertificate?.trim()) {
        createNotification({
          text: "Client Certificate and Client Private Key are required when mTLS is enabled.",
          type: "error"
        });
        return;
      }
    }

    const isConnected = await testLDAPConnection({
      url: watchUrl,
      bindDN: watchBindDN,
      bindPass: watchBindPass,
      caCert: watchCaCert ?? "",
      clientCertificate: watchEnableMtls ? (watchClientCertificate ?? "") : "",
      clientKeyCertificate: watchEnableMtls ? (watchClientKeyCertificate ?? "") : ""
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
              <FieldGroup className="mb-auto p-4">
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
                      <FieldLabel htmlFor="ldap-ca-cert">CA Certificate (Optional)</FieldLabel>
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
                <Controller
                  control={control}
                  name="enableMtls"
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>Mutual TLS (mTLS)</FieldTitle>
                        <FieldDescription>
                          Enable to present a client certificate during the TLS handshake.
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="ldap-enable-mtls"
                        variant="org"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </Field>
                  )}
                />
                {watchEnableMtls && (
                  <>
                    <Controller
                      control={control}
                      name="clientCertificate"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="ldap-client-cert">Client Certificate</FieldLabel>
                          <TextArea
                            id="ldap-client-cert"
                            placeholder="-----BEGIN CERTIFICATE----- ..."
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                          <p className="mt-1 text-xs text-mineshaft-400">
                            PEM-encoded client certificate used for mutual TLS (mTLS).
                          </p>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="clientKeyCertificate"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="ldap-client-key">Client Private Key</FieldLabel>
                          <TextArea
                            id="ldap-client-key"
                            placeholder={
                              watchHasStoredClientKey
                                ? "Key is configured. Paste a new value to replace it."
                                : "-----BEGIN PRIVATE KEY----- ..."
                            }
                            isError={Boolean(error)}
                            style={{ WebkitTextSecurity: "disc" } as CSSProperties}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                          <p className="mt-1 text-xs text-mineshaft-400">
                            PEM-encoded private key matching the Client Certificate. Stored
                            encrypted server-side and never returned to the browser after save.
                          </p>
                        </Field>
                      )}
                    />
                  </>
                )}
              </FieldGroup>
              <Button
                type="button"
                variant="outline"
                isFullWidth
                size="lg"
                className="my-4"
                onClick={handleTestLDAPConnection}
                isDisabled={!watchUrl || !watchBindDN || !watchBindPass || testIsLoading}
              >
                {testIsLoading ? (
                  <Lottie icon="infisical_loading" isAutoPlay className="mr-2 h-6 w-6" />
                ) : (
                  "Test Connection"
                )}
              </Button>
            </div>
            <SheetFooter className="justify-between border-t">
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="org"
                  isPending={isPending}
                  isDisabled={isPending || testIsLoading}
                >
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
