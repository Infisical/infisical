import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Input, Select, SelectItem, Switch, Tooltip } from "@app/components/v2";
import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { F5BigIpProfileType } from "@app/hooks/api/pkiSyncs/types/f5-big-ip-sync";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

const PROFILE_TYPE_OPTIONS: { value: F5BigIpProfileType; label: string }[] = [
  { value: F5BigIpProfileType.None, label: "None" },
  { value: F5BigIpProfileType.ClientSsl, label: "Client SSL Profile" },
  { value: F5BigIpProfileType.ServerSsl, label: "Server SSL Profile" }
];

export const F5BigIpPkiSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.F5BigIp }
  >();
  const profileType = watch("destinationConfig.profileType");
  const createProfileIfMissing = watch("destinationConfig.createProfileIfMissing");
  const requiresProfile = profileType !== undefined && profileType !== F5BigIpProfileType.None;

  useEffect(() => {
    if (!requiresProfile) {
      setValue("destinationConfig.profileName", undefined, { shouldValidate: false });
      setValue("destinationConfig.createProfileIfMissing", false, { shouldValidate: false });
      setValue("destinationConfig.parentProfile", undefined, { shouldValidate: false });
    }
  }, [requiresProfile, setValue]);

  useEffect(() => {
    if (!createProfileIfMissing) {
      setValue("destinationConfig.parentProfile", undefined, { shouldValidate: false });
    }
  }, [createProfileIfMissing, setValue]);

  return (
    <>
      <PkiSyncConnectionField />
      <Controller
        name="destinationConfig.partition"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Partition"
            isOptional
            tooltipText="The F5 partition where certificates will be stored. Defaults to Common."
          >
            <Input value={value ?? ""} onChange={onChange} placeholder="Common" />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.profileType"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Profile Binding"
            tooltipText="Attach each synced certificate to a Client SSL or Server SSL profile so the BIG-IP starts using it right away. F5 only allows one certificate per algorithm type (RSA, ECDSA, DSA) per profile, so use separate profiles if you have multiple certificates of the same type. Choose None to just upload certificates without attaching them."
          >
            <Select
              value={value ?? F5BigIpProfileType.None}
              onValueChange={(v) => onChange(v as F5BigIpProfileType)}
              className="w-full border border-mineshaft-500"
              dropdownContainerClassName="max-w-none"
              position="popper"
            >
              {PROFILE_TYPE_OPTIONS.map((option) => (
                <SelectItem value={option.value} key={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      {requiresProfile && (
        <>
          <Controller
            name="destinationConfig.profileName"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error)}
                errorText={error?.message}
                label={
                  profileType === F5BigIpProfileType.ServerSsl
                    ? "Server SSL Profile Name"
                    : "Client SSL Profile Name"
                }
                tooltipText="The name of the SSL profile inside the partition. Infisical will add each synced certificate to it."
              >
                <Input
                  value={value ?? ""}
                  onChange={onChange}
                  placeholder={
                    profileType === F5BigIpProfileType.ServerSsl
                      ? "e.g. backend-ssl"
                      : "e.g. clientssl-prod"
                  }
                />
              </FormControl>
            )}
          />
          <Controller
            name="destinationConfig.createProfileIfMissing"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl isError={Boolean(error)} errorText={error?.message}>
                <Switch
                  className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                  id="f5-create-profile-if-missing"
                  thumbClassName="bg-mineshaft-800"
                  isChecked={value ?? false}
                  onCheckedChange={onChange}
                >
                  <p>
                    Create profile if missing{" "}
                    <Tooltip
                      className="max-w-md"
                      content="Create the SSL profile on the BIG-IP if it doesn't exist yet. Off by default, since production profiles are usually managed by F5 administrators."
                    >
                      <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                    </Tooltip>
                  </p>
                </Switch>
              </FormControl>
            )}
          />
          {createProfileIfMissing && (
            <Controller
              name="destinationConfig.parentProfile"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error)}
                  errorText={error?.message}
                  label="Parent Profile"
                  isOptional
                  tooltipText={`The existing F5 profile we'll copy settings from when creating the new one. Defaults to /Common/${profileType === F5BigIpProfileType.ServerSsl ? "serverssl" : "clientssl"}. Enter just a name (looked up in /Common) or a full path like /MyPartition/my-parent.`}
                >
                  <Input
                    value={value ?? ""}
                    onChange={onChange}
                    placeholder={
                      profileType === F5BigIpProfileType.ServerSsl
                        ? "/Common/serverssl"
                        : "/Common/clientssl"
                    }
                  />
                </FormControl>
              )}
            />
          )}
        </>
      )}
    </>
  );
};
