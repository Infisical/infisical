import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheckIcon, Copy, Trash2 } from "lucide-react";
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
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useTimedReset, useToggle } from "@app/hooks";
import { useCreateSSOConfig, useGetSSOConfig, useUpdateSSOConfig } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { SSOModalHeader } from "./SSOModalHeader";

enum AuthProvider {
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  GOOGLE_SAML = "google-saml",
  AUTH0_SAML = "auth0-saml"
}

const ssoAuthProviders = [
  { label: "Okta SAML", value: AuthProvider.OKTA_SAML, image: "Okta.png", docsUrl: "okta" },
  {
    label: "Azure / Entra SAML",
    value: AuthProvider.AZURE_SAML,
    image: "Microsoft Azure.png",
    docsUrl: "azure"
  },
  {
    label: "JumpCloud SAML",
    value: AuthProvider.JUMPCLOUD_SAML,
    image: "JumpCloud.png",
    docsUrl: "jumpcloud"
  },
  {
    label: "Keycloak SAML",
    value: AuthProvider.KEYCLOAK_SAML,
    image: "Keycloak.png",
    docsUrl: "keycloak-saml"
  },
  {
    label: "Google SAML",
    value: AuthProvider.GOOGLE_SAML,
    image: "Google.png",
    docsUrl: "google-saml"
  },
  { label: "Auth0 SAML", value: AuthProvider.AUTH0_SAML, image: "Auth0.png", docsUrl: "auth0-saml" }
];

const schema = z
  .object({
    authProvider: z.string().min(1, "SSO Type is required"),
    entryPoint: z.string().trim().min(1, "URL required"),
    issuer: z.string().trim().min(1, "Issuer required"),
    cert: z.string().default("")
  })
  .required();

export type AddSSOFormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["addSSO"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addSSO"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addSSO"]>, state?: boolean) => void;
  hideDelete?: boolean;
};

export const SSOModal = ({ popUp, handlePopUpClose, handlePopUpToggle, hideDelete }: Props) => {
  const { currentOrg } = useOrganization();

  const { mutateAsync: createMutateAsync, isPending: createIsLoading } = useCreateSSOConfig();
  const { mutateAsync: updateMutateAsync, isPending: updateIsLoading } = useUpdateSSOConfig();
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useToggle();
  const { data } = useGetSSOConfig(currentOrg?.id ?? "");

  const { control, handleSubmit, reset, watch, setValue, getValues } = useForm<AddSSOFormData>({
    defaultValues: {
      authProvider: AuthProvider.OKTA_SAML
    },
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (data) {
      reset({
        authProvider: data?.authProvider ?? "",
        entryPoint: data?.entryPoint ?? "",
        issuer: data?.issuer ?? "",
        cert: data?.cert ?? ""
      });
    }
  }, [data]);

  const handleSamlSoftDelete = async () => {
    if (!currentOrg) {
      return;
    }
    await updateMutateAsync({
      organizationId: currentOrg.id,
      isActive: false,
      entryPoint: "",
      issuer: "",
      cert: ""
    });

    createNotification({
      text: "Successfully deleted SAML SSO configuration.",
      type: "success"
    });
  };

  const onSSOModalSubmit = async ({ authProvider, entryPoint, issuer, cert }: AddSSOFormData) => {
    if (!currentOrg) return;

    if (!data) {
      await createMutateAsync({
        organizationId: currentOrg.id,
        authProvider,
        isActive: false,
        entryPoint,
        issuer,
        cert
      });
    } else {
      await updateMutateAsync({
        organizationId: currentOrg.id,
        authProvider,
        isActive: false,
        entryPoint,
        issuer,
        cert
      });
    }

    handlePopUpClose("addSSO");

    createNotification({
      text: `Successfully ${!data ? "added" : "updated"} SAML SSO configuration`,
      type: "success"
    });
  };

  const [, isAcsCopied, setAcsCopied] = useTimedReset<string>({ initialState: "" });
  const [, isAudienceCopied, setAudienceCopied] = useTimedReset<string>({ initialState: "" });

  const renderLabels = (authProvider: string) => {
    switch (authProvider) {
      case AuthProvider.OKTA_SAML:
        return {
          acsUrl: "Single sign-on URL",
          entityId: "Audience URI (SP Entity ID)",
          entryPoint: "Identity Provider Single Sign-On URL",
          entryPointPlaceholder: "https://your-domain.okta.com/app/app-name/xxx/sso/saml",
          issuer: "Identity Provider Issuer",
          issuerPlaceholder: "http://www.okta.com/xxx"
        };
      case AuthProvider.AZURE_SAML:
        return {
          acsUrl: "Reply URL (Assertion Consumer Service URL)",
          entityId: "Identifier (Entity ID)",
          entryPoint: "Login URL",
          entryPointPlaceholder: "https://login.microsoftonline.com/xxx/saml2",
          issuer: "Azure / Entra Application ID",
          issuerPlaceholder: "abc-def-ghi-jkl-mno"
        };
      case AuthProvider.JUMPCLOUD_SAML:
        return {
          acsUrl: "ACS URL",
          entityId: "SP Entity ID",
          entryPoint: "IDP URL",
          entryPointPlaceholder: "https://sso.jumpcloud.com/saml2/xxx",
          issuer: "IdP Entity ID",
          issuerPlaceholder: "xxx"
        };
      case AuthProvider.KEYCLOAK_SAML:
        return {
          acsUrl: "Valid redirect URI",
          entityId: "SP Entity ID",
          entryPoint: "IDP URL",
          entryPointPlaceholder: "https://keycloak.mysite.com/realms/myrealm/protocol/saml",
          issuer: "Client ID",
          issuerPlaceholder: window.origin
        };
      case AuthProvider.GOOGLE_SAML:
        return {
          acsUrl: "ACS URL",
          entityId: "SP Entity ID",
          entryPoint: "SSO URL",
          entryPointPlaceholder: "https://accounts.google.com/o/saml2/idp?idpid=xxx",
          issuer: "Issuer",
          issuerPlaceholder: window.origin
        };
      case AuthProvider.AUTH0_SAML:
        return {
          acsUrl: "Application Callback URL",
          entityId: "Audience",
          entryPoint: "Identity Provider Login URL",
          entryPointPlaceholder: "https://xxx.auth0.com/samlp/xxx",
          issuer: "Issuer",
          issuerPlaceholder: "urn:xxx-xxx.us.auth0.com"
        };
      default:
        return {
          acsUrl: "ACS URL",
          entityId: "Entity ID",
          entryPoint: "Entrypoint",
          entryPointPlaceholder: "Enter entrypoint...",
          issuer: "Issuer",
          issuerPlaceholder: "Enter placeholder..."
        };
    }
  };

  const authProvider = watch("authProvider");
  useEffect(() => {
    if (authProvider === AuthProvider.GOOGLE_SAML && getValues("issuer") === "") {
      setValue("issuer", window.origin);
    }
  }, [authProvider]);

  const isPending = createIsLoading || updateIsLoading;
  const labels = renderLabels(authProvider);

  return (
    <>
      <Sheet
        open={popUp?.addSSO?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addSSO", isOpen);
          reset();
        }}
      >
        <SheetContent className="sm:max-w-2xl">
          <form onSubmit={handleSubmit(onSSOModalSubmit)} className="flex h-full min-h-0 flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-x-2">
                Manage SAML Configuration
                <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
              </SheetTitle>
            </SheetHeader>
            <div className="thin-scrollbar flex-1 overflow-y-auto px-4">
              <SSOModalHeader
                providerDetails={
                  ssoAuthProviders.find((provider) => provider.value === authProvider)!
                }
                isConnected={Boolean(data)}
              />
              <FieldGroup>
                <Controller
                  control={control}
                  name="authProvider"
                  defaultValue="okta-saml"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="sso-auth-provider">Type</FieldLabel>
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger
                          id="sso-auth-provider"
                          className="w-full"
                          isError={Boolean(error)}
                        >
                          <SelectValue placeholder="Select SSO type" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {ssoAuthProviders.map(({ label, value: providerValue }) => (
                            <SelectItem value={providerValue} key={label}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                {authProvider && data && (
                  <>
                    <Field>
                      <FieldLabel className="flex items-center justify-between">
                        {labels.acsUrl}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              aria-label="copy application callback url"
                              variant="ghost-muted"
                              size="xs"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${window.origin}/api/v1/sso/saml2/${data.id}`
                                );
                                setAcsCopied("copied");
                              }}
                            >
                              {isAcsCopied ? <ClipboardCheckIcon /> : <Copy />}
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent>{isAcsCopied ? "Copied" : "Copy"}</TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <p className="text-muted-foreground text-sm break-all">
                        {`${window.origin}/api/v1/sso/saml2/${data.id}`}
                      </p>
                    </Field>
                    <Field>
                      <FieldLabel className="flex items-center justify-between">
                        {labels.entityId}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              aria-label="copy audience"
                              variant="ghost-muted"
                              size="xs"
                              onClick={() => {
                                navigator.clipboard.writeText(window.origin);
                                setAudienceCopied("copied");
                              }}
                            >
                              {isAudienceCopied ? <ClipboardCheckIcon /> : <Copy />}
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent>{isAudienceCopied ? "Copied" : "Copy"}</TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <p className="text-muted-foreground text-sm">{window.origin}</p>
                    </Field>
                    <Controller
                      control={control}
                      name="entryPoint"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="sso-entry-point">{labels.entryPoint}</FieldLabel>
                          <Input
                            id="sso-entry-point"
                            placeholder={labels.entryPointPlaceholder}
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
                      name="issuer"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel
                            htmlFor="sso-issuer"
                            className="inline-flex flex-wrap items-baseline gap-1.5"
                          >
                            {labels.issuer}
                          </FieldLabel>
                          <Input
                            id="sso-issuer"
                            placeholder={labels.issuerPlaceholder}
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
                      name="cert"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel
                            htmlFor="sso-cert"
                            className="inline-flex flex-wrap items-baseline gap-1.5"
                          >
                            Certificate (optional)
                          </FieldLabel>
                          <TextArea
                            id="sso-cert"
                            placeholder="-----BEGIN CERTIFICATE----- ..."
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                  </>
                )}
              </FieldGroup>
            </div>
            <SheetFooter className="justify-between border-t">
              <div className="flex gap-2">
                <Button type="submit" variant="org" isPending={isPending}>
                  {!data?.isActive ? "Configure SAML" : "Update Configuration"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => handlePopUpClose("addSSO")}>
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
            <AlertDialogTitle>Delete SAML Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the SAML connection. Members will no longer be able to sign in via SAML
              until it&apos;s reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleSamlSoftDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
