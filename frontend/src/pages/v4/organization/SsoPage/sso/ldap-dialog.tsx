import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { SecretInput } from "@app/components/v4/ui/secret-input";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Textarea } from "@app/components/v4/ui/textarea";

import { useOrgId } from "../../../access/permissions";
import { failed, saved, toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { LdapConfig } from "../../../data/sso/contract";

const LDAPFormSchema = z
  .object({
    url: z.string().trim().min(1, "URL is required"),
    bindDN: z.string().trim().min(1, "Bind DN is required"),
    bindPass: z.string().min(1, "Bind pass is required"),
    searchBase: z.string().trim().min(1, "User search base is required"),
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
      message: "Client certificate and client private key are required when mTLS is enabled.",
      path: ["clientKeyCertificate"]
    }
  );

type TLDAPFormData = z.infer<typeof LDAPFormSchema>;

const toFormValues = (data: LdapConfig | null | undefined): TLDAPFormData => ({
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
  enableMtls: Boolean(data?.hasClientKeyCertificate) || Boolean(data?.clientCertificate),
  uniqueUserAttribute: data?.uniqueUserAttribute ?? ""
});

type TextFieldName =
  | "url"
  | "bindDN"
  | "searchBase"
  | "uniqueUserAttribute"
  | "searchFilter"
  | "groupSearchBase"
  | "groupSearchFilter";

export const LdapConfigDialog = ({
  open,
  onOpenChange,
  hideDelete
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hideDelete?: boolean;
}) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { data } = sso.useLdapConfig(orgId);
  const create = sso.useCreateLdapConfig();
  const update = sso.useUpdateLdapConfig();
  const test = sso.useTestLdapConnection();
  const formId = useId();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { control, handleSubmit, reset, watch } = useForm<TLDAPFormData>({
    resolver: zodResolver(LDAPFormSchema),
    defaultValues: toFormValues(data)
  });

  useEffect(() => {
    if (open) reset(toFormValues(data));
  }, [data, open]);

  const watchUrl = watch("url");
  const watchBindDN = watch("bindDN");
  const watchBindPass = watch("bindPass");
  const watchCaCert = watch("caCert");
  const watchClientCertificate = watch("clientCertificate");
  const watchClientKeyCertificate = watch("clientKeyCertificate");
  const watchHasStoredClientKey = watch("hasStoredClientKey");
  const watchEnableMtls = watch("enableMtls");

  const handleLdapSoftDelete = async () => {
    setDeleting(true);
    try {
      await update.mutateAsync({
        organizationId: orgId,
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
      saved("Successfully deleted LDAP configuration");
      setIsDeleteOpen(false);
    } catch (error) {
      failed("Failed to delete LDAP configuration", error);
    } finally {
      setDeleting(false);
    }
  };

  const onSubmit = async ({
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
    // Without mTLS both values are sent empty to clear them; with mTLS and no new key, the key is
    // omitted so the stored one is kept.
    const certForPayload = enableMtls ? clientCertificate : "";
    let keyForPayload: string | undefined;
    if (!enableMtls) {
      keyForPayload = "";
    } else if (hasStoredClientKey && !clientKeyCertificate?.trim()) {
      keyForPayload = undefined;
    } else {
      keyForPayload = clientKeyCertificate;
    }

    const fields = {
      organizationId: orgId,
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
    };

    try {
      if (!data) {
        await create.mutateAsync({ ...fields, isActive: false });
      } else {
        await update.mutateAsync(fields);
      }
      onOpenChange(false);
      saved(`Successfully ${!data ? "added" : "updated"} LDAP configuration`);
    } catch (error) {
      failed(`Failed to ${!data ? "add" : "update"} LDAP configuration`, error);
    }
  };

  const handleTestLDAPConnection = async () => {
    if (watchEnableMtls) {
      if (watchHasStoredClientKey && !watchClientKeyCertificate?.trim()) {
        toast({
          title:
            "Paste the Client Private Key to test the connection. Stored keys are not sent to the browser."
        });
        return;
      }
      if (!watchClientCertificate?.trim() || !watchClientKeyCertificate?.trim()) {
        failed("Client certificate and client private key are required when mTLS is enabled.");
        return;
      }
    }

    const connectionFailed =
      "Failed to connect to the LDAP server. Verify the URL, bind DN/password, and CA certificate.";
    try {
      const isConnected = await test.mutateAsync({
        url: watchUrl,
        bindDN: watchBindDN,
        bindPass: watchBindPass,
        caCert: watchCaCert ?? "",
        clientCertificate: watchEnableMtls ? (watchClientCertificate ?? "") : "",
        clientKeyCertificate: watchEnableMtls ? (watchClientKeyCertificate ?? "") : ""
      });
      if (isConnected) {
        saved("Successfully tested the LDAP connection: Bind operation was successful");
      } else {
        failed(connectionFailed);
      }
    } catch (error) {
      failed(connectionFailed, error);
    }
  };

  const isPending = create.isPending || update.isPending;
  const isExistingConfig = Boolean(data?.url);
  const canTest = Boolean(watchUrl && watchBindDN && watchBindPass);

  const textField = (name: TextFieldName, label: string, placeholder: string, optional = false) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field wide label={label} optional={optional} error={error?.message}>
          <Input
            mono
            placeholder={placeholder}
            autoComplete="off"
            invalid={Boolean(error)}
            {...field}
            value={field.value ?? ""}
          />
        </Field>
      )}
    />
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent size="lg" pending={isPending}>
          <form id={formId} noValidate onSubmit={handleSubmit(onSubmit)}>
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8} wrap={false}>
                  Manage LDAP configuration
                  <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
                </Inline>
              </SheetTitle>
            </SheetHeader>
            <SheetBody>
              <Stack gap={16}>
                {textField("url", "URL", "ldaps://ldap.myorg.com:636")}
                {textField("bindDN", "Bind DN", "cn=infisical,ou=Users,dc=example,dc=com")}
                <Controller
                  control={control}
                  name="bindPass"
                  render={({ field, fieldState: { error } }) => (
                    <Field wide label="Bind pass" error={error?.message}>
                      <SecretInput
                        placeholder="********"
                        invalid={Boolean(error)}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </Field>
                  )}
                />
                {textField("searchBase", "User search base / user DN", "ou=people,dc=acme,dc=com")}
                {textField("uniqueUserAttribute", "Unique user attribute", "uidNumber", true)}
                {textField("searchFilter", "User search filter", "(uid={{username}})", true)}
                {textField(
                  "groupSearchBase",
                  "Group search base / group DN",
                  "ou=groups,dc=acme,dc=com",
                  true
                )}
                {textField(
                  "groupSearchFilter",
                  "Group filter",
                  "(&(objectClass=posixGroup)(memberUid={{.Username}}))",
                  true
                )}
                <Controller
                  control={control}
                  name="caCert"
                  render={({ field, fieldState: { error } }) => (
                    <Field wide label="CA certificate" optional error={error?.message}>
                      <Textarea
                        mono
                        placeholder="-----BEGIN CERTIFICATE----- ..."
                        aria-invalid={Boolean(error) || undefined}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="enableMtls"
                  render={({ field }) => (
                    <Checkbox
                      label="Mutual TLS (mTLS)"
                      description="Present a client certificate during the TLS handshake."
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {watchEnableMtls && (
                  <>
                    <Controller
                      control={control}
                      name="clientCertificate"
                      render={({ field, fieldState: { error } }) => (
                        <Field
                          wide
                          label="Client certificate"
                          error={error?.message}
                          description="PEM-encoded client certificate used for mutual TLS (mTLS)."
                        >
                          <Textarea
                            mono
                            placeholder="-----BEGIN CERTIFICATE----- ..."
                            aria-invalid={Boolean(error) || undefined}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="clientKeyCertificate"
                      render={({ field, fieldState: { error } }) => (
                        <Field
                          wide
                          label="Client private key"
                          error={error?.message}
                          description="PEM-encoded private key matching the client certificate. Stored encrypted server-side and never returned to the browser after save."
                        >
                          <SecretInput
                            multiline
                            placeholder={
                              watchHasStoredClientKey
                                ? "Key is configured. Paste a new value to replace it."
                                : "-----BEGIN PRIVATE KEY----- ..."
                            }
                            invalid={Boolean(error)}
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                          />
                        </Field>
                      )}
                    />
                  </>
                )}
                <Inline>
                  <Button
                    type="button"
                    variant="outline"
                    loading={test.isPending}
                    disabledReason={
                      canTest
                        ? undefined
                        : "Enter the URL, bind DN and bind pass to test the connection"
                    }
                    onClick={handleTestLDAPConnection}
                  >
                    Test connection
                  </Button>
                </Inline>
              </Stack>
            </SheetBody>
            <SheetFooter>
              <Inline justify="between">
                <Inline gap={8}>
                  <Button
                    type="submit"
                    loading={isPending}
                    disabledReason={
                      test.isPending ? "Wait for the connection test to finish" : undefined
                    }
                  >
                    {isExistingConfig ? "Update" : "Configure LDAP"}
                  </Button>
                  <SheetClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </SheetClose>
                </Inline>
                {!hideDelete && (
                  <Button type="button" variant="destructive" onClick={() => setIsDeleteOpen(true)}>
                    Delete
                  </Button>
                )}
              </Inline>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent tone="danger" pending={deleting}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete LDAP configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the LDAP connection. Members will no longer be able to sign in via LDAP
              until it&apos;s reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" loading={deleting} onClick={handleLdapSoftDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
