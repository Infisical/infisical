import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, ModalClose, Select, SelectItem, Tooltip } from "@app/components/v2";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { OracleDBConnectionMethod, TOracleDBConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PlatformManagedConfirmationModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm/shared/PlatformManagedConfirmationModal";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import {
  BaseSqlUsernameAndPasswordConnectionSchema,
  PlatformManagedNoticeBanner,
  SqlConnectionFields
} from "./shared";

type Props = {
  appConnection?: TOracleDBConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OracleDB),
  isPlatformManagedCredentials: z.boolean().optional()
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(OracleDBConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

type FormData = z.infer<typeof formSchema>;

export const OracleDBConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.OracleDB,
      method: OracleDBConnectionMethod.UsernameAndPassword,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        host: "",
        port: 1521,
        database: "ORCL", // Typically FREEPDB1 or ORCL
        username: "", // Typically pdbadmin or ADMIN
        password: "",
        sslEnabled: true,
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const {
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const { subscription } = useSubscription();
  const isPlatformManagedCredentials = appConnection?.isPlatformManagedCredentials ?? false;
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  const confirmSubmit = async (formData: FormData) => {
    if (formData.isPlatformManagedCredentials) {
      setShowConfirmation(true);
      return;
    }

    await onSubmit(formData);
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(confirmSubmit)(e);
        }}
      >
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <FormControl label="Gateway">
                <Tooltip
                  isDisabled={isAllowed}
                  content="Restricted access. You don't have permission to attach gateways to resources."
                >
                  <div>
                    <GatewayPicker
                      isDisabled={!isAllowed}
                      value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                      onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                        setValue("gatewayId", newGwId, { shouldDirty: true });
                        setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                      }}
                    />
                  </div>
                </Tooltip>
              </FormControl>
            )}
          </OrgPermissionCan>
        )}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.OracleDB].name
              }. This field cannot be changed after creation.`}
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(OracleDBConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        <SqlConnectionFields
          isPlatformManagedCredentials={isPlatformManagedCredentials}
          selectedTabIndex={selectedTabIndex}
          setSelectedTabIndex={setSelectedTabIndex}
        />
        {isPlatformManagedCredentials ? (
          <PlatformManagedNoticeBanner />
        ) : (
          <div className="mt-6 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              colorSchema="secondary"
              isLoading={isSubmitting}
              isDisabled={isSubmitting || !isDirty}
            >
              {isUpdate ? "Update Credentials" : "Connect to Database"}
            </Button>
            <ModalClose asChild>
              <Button colorSchema="secondary" variant="plain">
                Cancel
              </Button>
            </ModalClose>
          </div>
        )}
      </form>
      <PlatformManagedConfirmationModal
        onConfirm={() => handleSubmit(onSubmit)()}
        onOpenChange={setShowConfirmation}
        isOpen={showConfirmation}
      />
    </FormProvider>
  );
};
