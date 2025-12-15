import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, ModalClose, Select, SelectItem, Tooltip } from "@app/components/v2";
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  MsSqlConnectionMethod,
  TMsSqlConnection
} from "@app/hooks/api/appConnections/types/mssql-connection";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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
  appConnection?: TMsSqlConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MsSql),
  isPlatformManagedCredentials: z.boolean().optional()
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(MsSqlConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

type FormData = z.infer<typeof formSchema>;

export const MsSqlConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.MsSql,
      method: MsSqlConnectionMethod.UsernameAndPassword,
      gatewayId: null,
      credentials: {
        host: "",
        port: 1433,
        database: "default",
        username: "",
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
    formState: { isSubmitting, isDirty }
  } = form;

  const { subscription } = useSubscription();
  const isPlatformManagedCredentials = appConnection?.isPlatformManagedCredentials ?? false;
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

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
        {subscription.get(SubscriptionProductCategory.Platform, "gateway") && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Controller
                control={control}
                name="gatewayId"
                defaultValue=""
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    label="Gateway"
                  >
                    <Tooltip
                      isDisabled={isAllowed}
                      content="Restricted access. You don't have permission to attach gateways to resources."
                    >
                      <div>
                        <Select
                          isDisabled={!isAllowed}
                          value={value as string}
                          onValueChange={onChange}
                          className="w-full border border-mineshaft-500"
                          dropdownContainerClassName="max-w-none"
                          isLoading={isGatewaysLoading}
                          placeholder="Default: Internet Gateway"
                          position="popper"
                        >
                          <SelectItem
                            value={null as unknown as string}
                            onClick={() => onChange(undefined)}
                          >
                            Internet Gateway
                          </SelectItem>
                          {gateways?.map((el) => (
                            <SelectItem value={el.id} key={el.id}>
                              {el.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>
                    </Tooltip>
                  </FormControl>
                )}
              />
            )}
          </OrgPermissionCan>
        )}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.MsSql].name
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
                {Object.values(MsSqlConnectionMethod).map((method) => {
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
