import { useEffect } from "react";
import { Controller, useFormContext, useFormState, useWatch } from "react-hook-form";
import { AxiosError } from "axios";
import { Info } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Label,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getPaloAltoNetworksProfileLabel } from "@app/helpers/pkiSyncs";
import {
  TPaloAltoNetworksSslTlsServiceProfile,
  usePaloAltoNetworksConnectionListSslTlsServiceProfiles,
  usePaloAltoNetworksConnectionListTemplates
} from "@app/hooks/api/appConnections/palo-alto-networks";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type TPaloAltoNetworksForm = TPkiSyncForm & { destination: PkiSync.PaloAltoNetworksSslTlsProfile };

const getProfileValue = (profile: TPaloAltoNetworksSslTlsServiceProfile) =>
  `${profile.name}:${profile.vsys ?? ""}`;

const getFetchErrorMessage = (error: unknown, fallback: string) =>
  (error as AxiosError<{ message?: string }>)?.response?.data?.message ?? fallback;

export const PaloAltoNetworksPkiSyncFields = ({
  withSslTlsServiceProfile = false
}: {
  withSslTlsServiceProfile?: boolean;
}) => {
  const { control, setValue, clearErrors, getFieldState } = useFormContext<TPaloAltoNetworksForm>();

  const connectionId = useWatch({ name: "connection.id", control });
  const template = useWatch({ name: "destinationConfig.template", control });
  const profileName = useWatch({ name: "destinationConfig.sslTlsServiceProfileName", control });
  const profileVsys = useWatch({ name: "destinationConfig.sslTlsServiceProfileVsys", control });
  const profileNameError = getFieldState(
    "destinationConfig.sslTlsServiceProfileName",
    useFormState({ control, name: "destinationConfig.sslTlsServiceProfileName" })
  ).error;

  const {
    data: templatesData,
    isLoading: isDetectingDevice,
    isError: isTemplatesError,
    error: templatesError
  } = usePaloAltoNetworksConnectionListTemplates(connectionId);

  const isPanorama = Boolean(templatesData?.isPanorama);
  const templates = templatesData?.templates ?? [];

  const isProfileSelectReady = Boolean(templatesData) && (!isPanorama || Boolean(template));

  const {
    data: profiles = [],
    isFetching: isLoadingProfiles,
    isError: isProfilesError,
    error: profilesError
  } = usePaloAltoNetworksConnectionListSslTlsServiceProfiles(connectionId, template, {
    enabled: withSslTlsServiceProfile && isProfileSelectReady
  });

  useEffect(() => {
    if (templatesData && !templatesData.isPanorama && template) {
      setValue("destinationConfig.template", "", { shouldDirty: true });
    }
  }, [templatesData, template]);

  const clearProfile = () => {
    setValue("destinationConfig.sslTlsServiceProfileName", "", { shouldDirty: true });
    setValue("destinationConfig.sslTlsServiceProfileVsys", "", { shouldDirty: true });
    clearErrors("destinationConfig.sslTlsServiceProfileName");
  };

  let profilePlaceholder = "Select an SSL/TLS service profile";
  if (!connectionId) profilePlaceholder = "Select a connection first";
  else if (isDetectingDevice) profilePlaceholder = "Detecting device type...";
  else if (isPanorama && !template) profilePlaceholder = "Select a template first";

  const deviceError =
    connectionId && isTemplatesError
      ? {
          message: getFetchErrorMessage(
            templatesError,
            "Failed to read the device. Check the connection settings."
          )
        }
      : undefined;

  const profileError =
    profileNameError ??
    (connectionId && isProfilesError
      ? {
          message: getFetchErrorMessage(
            profilesError,
            "Failed to fetch SSL/TLS service profiles. Check the connection settings."
          )
        }
      : undefined);

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.template", "");
          clearProfile();
        }}
      />
      {deviceError && <FieldError className="-mt-2 mb-4" errors={[deviceError]} />}
      {isPanorama && (
        <Controller
          name="destinationConfig.template"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Template
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Panorama delivers certificates to firewalls through templates. The sync stores
                    certificates in this template.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FilterableSelect
                options={templates.map((name) => ({ name }))}
                value={value ? { name: value } : null}
                onChange={(option) => {
                  onChange((option as { name: string } | null)?.name ?? "");
                  clearErrors("destinationConfig.template");
                  clearProfile();
                }}
                getOptionLabel={(option) => (option as { name: string }).name}
                getOptionValue={(option) => (option as { name: string }).name}
                placeholder="Select a template"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
      {withSslTlsServiceProfile && (
        <Field className="mb-4">
          <FieldLabel>
            SSL/TLS Service Profile
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                The sync imports the certificate and sets it as this profile&apos;s certificate. A
                profile uses one certificate, and this sync holds one.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <FilterableSelect
            isDisabled={!isProfileSelectReady}
            isLoading={isLoadingProfiles}
            options={profiles}
            value={profileName ? { name: profileName, vsys: profileVsys ?? null } : null}
            onChange={(option) => {
              const profile = option as TPaloAltoNetworksSslTlsServiceProfile | null;
              setValue("destinationConfig.sslTlsServiceProfileVsys", profile?.vsys ?? "", {
                shouldDirty: true
              });
              setValue("destinationConfig.sslTlsServiceProfileName", profile?.name ?? "", {
                shouldDirty: true,
                shouldValidate: true
              });
            }}
            getOptionLabel={(option) =>
              getPaloAltoNetworksProfileLabel(option as TPaloAltoNetworksSslTlsServiceProfile)
            }
            getOptionValue={(option) =>
              getProfileValue(option as TPaloAltoNetworksSslTlsServiceProfile)
            }
            placeholder={profilePlaceholder}
            isError={Boolean(profileError)}
          />
          <FieldError errors={[profileError]} />
        </Field>
      )}
      {isPanorama && (
        <Controller
          name="destinationConfig.pushToDevices"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="palo-alto-networks-push-to-devices">Push to Devices</Label>
                  <FieldDescription>
                    Pushes every template stack that contains this template to its firewalls when a
                    sync changes the template.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  id="palo-alto-networks-push-to-devices"
                  variant="project"
                  checked={value ?? true}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
    </>
  );
};
