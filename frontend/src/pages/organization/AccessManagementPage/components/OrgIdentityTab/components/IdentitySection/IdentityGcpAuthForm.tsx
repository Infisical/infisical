import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import {
  useAddIdentityGcpAuth,
  useGetIdentityGcpAuth,
  useUpdateIdentityGcpAuth
} from "@app/hooks/api";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityFormTab } from "./types";

const schema = z
  .object({
    type: z.enum(["iam", "gce"]),
    allowedServiceAccounts: z.string(),
    allowedProjects: z.string(),
    allowedZones: z.string(),
    accessTokenTTL: z.string().refine((val) => Number(val) <= 315360000, {
      message: "Access Token TTL cannot be greater than 315360000"
    }),
    accessTokenMaxTTL: z.string().refine((val) => Number(val) <= 315360000, {
      message: "Access Token Max TTL cannot be greater than 315360000"
    }),
    accessTokenNumUsesLimit: z.string(),
    accessTokenTrustedIps: z
      .array(
        z.object({
          ipAddress: z.string().max(50)
        })
      )
      .min(1)
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["upgradePlan"]>,
    data?: { featureName?: string }
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod"]>,
    state?: boolean
  ) => void;
  identityId?: string;
  isUpdate?: boolean;
};

export const IdentityGcpAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityId,
  isUpdate
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const { projectId } = useParams({
    strict: false
  });
  const { mutateAsync: addMutateAsync } = useAddIdentityGcpAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityGcpAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityGcpAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "gce",
      allowedServiceAccounts: "",
      allowedProjects: "",
      allowedZones: "",
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
    }
  });

  const watchedType = watch("type");

  const {
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

  useEffect(() => {
    if (data) {
      reset({
        type: data.type || "gce",
        allowedServiceAccounts: data.allowedServiceAccounts,
        allowedProjects: data.allowedProjects,
        allowedZones: data.allowedZones,
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: String(data.accessTokenNumUsesLimit),
        accessTokenTrustedIps: data.accessTokenTrustedIps.map(
          ({ ipAddress, prefix }: IdentityTrustedIp) => {
            return {
              ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
            };
          }
        )
      });
    } else {
      reset({
        type: "gce",
        allowedServiceAccounts: "",
        allowedProjects: "",
        allowedZones: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  const onFormSubmit = async ({
    type,
    allowedServiceAccounts,
    allowedProjects,
    allowedZones,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps
  }: FormData) => {
    if (!identityId) return;

    if (data) {
      await updateMutateAsync({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId }),
        type,
        allowedServiceAccounts,
        allowedProjects,
        allowedZones,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId }),
        type,
        allowedServiceAccounts: allowedServiceAccounts || "",
        allowedProjects: allowedProjects || "",
        allowedZones: allowedZones || "",
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
        accessTokenTrustedIps
      });
    }

    handlePopUpToggle("identityAuthMethod", false);

    createNotification({
      text: `Successfully ${isUpdate ? "updated" : "configured"} auth method`,
      type: "success"
    });
    reset();
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        setTabValue(
          ["accessTokenTrustedIps"].includes(Object.keys(fields)[0])
            ? IdentityFormTab.Advanced
            : IdentityFormTab.Configuration
        );
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabList>
          <Tab value={IdentityFormTab.Configuration}>Configuration</Tab>
          <Tab value={IdentityFormTab.Advanced}>Advanced</Tab>
        </TabList>
        <TabPanel value={IdentityFormTab.Configuration}>
          <Controller
            control={control}
            name="type"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Type" isError={Boolean(error)} errorText={error?.message}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  <SelectItem value="gce" key="gce">
                    GCP ID Token Auth (Recommended)
                  </SelectItem>
                  <SelectItem value="iam" key="iam">
                    GCP IAM Auth
                  </SelectItem>
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="2592000"
            name="allowedServiceAccounts"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Service Account Emails"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input
                  {...field}
                  placeholder="test@project.iam.gserviceaccount.com, 12345-compute@developer.gserviceaccount.com"
                  type="text"
                />
              </FormControl>
            )}
          />
          {watchedType === "gce" && (
            <Controller
              control={control}
              name="allowedProjects"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Allowed Projects"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="my-gcp-project, ..." />
                </FormControl>
              )}
            />
          )}
          {watchedType === "gce" && (
            <Controller
              control={control}
              name="allowedZones"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Allowed Zones"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="us-west2-a, us-central1-a, ..." />
                </FormControl>
              )}
            />
          )}
          <Controller
            control={control}
            defaultValue="2592000"
            name="accessTokenTTL"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token TTL (seconds)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="2592000" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="2592000"
            name="accessTokenMaxTTL"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token Max TTL (seconds)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="2592000" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="0"
            name="accessTokenNumUsesLimit"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token Max Number of Uses"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="0" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
        </TabPanel>
        <TabPanel value={IdentityFormTab.Advanced}>
          {accessTokenTrustedIpsFields.map(({ id }, index) => (
            <div className="mb-3 flex items-end space-x-2" key={id}>
              <Controller
                control={control}
                name={`accessTokenTrustedIps.${index}.ipAddress`}
                defaultValue="0.0.0.0/0"
                render={({ field, fieldState: { error } }) => {
                  return (
                    <FormControl
                      className="mb-0 grow"
                      label={index === 0 ? "Access Token Trusted IPs" : undefined}
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => {
                          if (subscription?.ipAllowlisting) {
                            field.onChange(e);
                            return;
                          }

                          handlePopUpOpen("upgradePlan", {
                            featureName: "IP allowlisting"
                          });
                        }}
                        placeholder="123.456.789.0"
                      />
                    </FormControl>
                  );
                }}
              />
              <IconButton
                onClick={() => {
                  if (subscription?.ipAllowlisting) {
                    removeAccessTokenTrustedIp(index);
                    return;
                  }

                  handlePopUpOpen("upgradePlan", {
                    featureName: "IP allowlisting"
                  });
                }}
                size="lg"
                colorSchema="danger"
                variant="plain"
                ariaLabel="update"
                className="p-3"
              >
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </div>
          ))}
          <div className="my-4 ml-1">
            <Button
              variant="outline_bg"
              onClick={() => {
                if (subscription?.ipAllowlisting) {
                  appendAccessTokenTrustedIp({
                    ipAddress: "0.0.0.0/0"
                  });
                  return;
                }

                handlePopUpOpen("upgradePlan", {
                  featureName: "IP allowlisting"
                });
              }}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
            >
              Add IP Address
            </Button>
          </div>
        </TabPanel>
      </Tabs>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? "Update" : "Add"}
        </Button>

        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("identityAuthMethod", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
