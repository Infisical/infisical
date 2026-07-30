import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
          <Field className="mb-4">
            <FieldLabel>
              Partition <span className="text-muted">(optional)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The F5 partition where certificates will be stored. Defaults to Common.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              value={value ?? ""}
              onChange={onChange}
              placeholder="Common"
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.profileType"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Profile Binding
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Attach each synced certificate to a Client SSL or Server SSL profile so the BIG-IP
                  starts using it right away. F5 only allows one certificate per algorithm type
                  (RSA, ECDSA, DSA) per profile, so use separate profiles if you have multiple
                  certificates of the same type. Choose None to just upload certificates without
                  attaching them.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Select
              value={value ?? F5BigIpProfileType.None}
              onValueChange={(v) => onChange(v as F5BigIpProfileType)}
            >
              <SelectTrigger className="w-full" isError={Boolean(error)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {PROFILE_TYPE_OPTIONS.map((option) => (
                  <SelectItem value={option.value} key={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      {requiresProfile && (
        <>
          <Controller
            name="destinationConfig.profileName"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel>
                  {profileType === F5BigIpProfileType.ServerSsl
                    ? "Server SSL Profile Name"
                    : "Client SSL Profile Name"}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      The name of the SSL profile inside the partition. Infisical will add each
                      synced certificate to it.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Input
                  value={value ?? ""}
                  onChange={onChange}
                  placeholder={
                    profileType === F5BigIpProfileType.ServerSsl
                      ? "e.g. backend-ssl"
                      : "e.g. clientssl-prod"
                  }
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="destinationConfig.createProfileIfMissing"
            control={control}
            render={({ field: { value, onChange } }) => (
              <Field className="mb-4">
                <Field orientation="horizontal">
                  <FieldContent>
                    <Label
                      htmlFor="f5-create-profile-if-missing"
                      className="flex items-center gap-1.5"
                    >
                      Create profile if missing
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3.5 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          Create the SSL profile on the BIG-IP if it doesn&apos;t exist yet. Off by
                          default, since production profiles are usually managed by F5
                          administrators.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                  </FieldContent>
                  <Switch
                    id="f5-create-profile-if-missing"
                    variant="project"
                    checked={value ?? false}
                    onCheckedChange={onChange}
                  />
                </Field>
              </Field>
            )}
          />
          {createProfileIfMissing && (
            <Controller
              name="destinationConfig.parentProfile"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>
                    Parent Profile <span className="text-muted">(optional)</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        {`The existing F5 profile we'll copy settings from when creating the new one. Defaults to /Common/${profileType === F5BigIpProfileType.ServerSsl ? "serverssl" : "clientssl"}. Enter just a name (looked up in /Common) or a full path like /MyPartition/my-parent.`}
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    value={value ?? ""}
                    onChange={onChange}
                    placeholder={
                      profileType === F5BigIpProfileType.ServerSsl
                        ? "/Common/serverssl"
                        : "/Common/clientssl"
                    }
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          )}
        </>
      )}
    </>
  );
};
