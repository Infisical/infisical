import { Dispatch, SetStateAction } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  SecretInput,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";

type Props = {
  isPlatformManagedCredentials: boolean;
  selectedTabIndex: number;
  setSelectedTabIndex: Dispatch<SetStateAction<number>>;
};

const CONFIGURATION_TAB = "configuration";
const SSL_TAB = "ssl";

export const SqlConnectionFields = ({
  isPlatformManagedCredentials,
  setSelectedTabIndex,
  selectedTabIndex
}: Props) => {
  const { control, watch } = useFormContext();
  const scopeVariant = useScopeVariant();

  const sslEnabled = watch("credentials.sslEnabled");
  return (
    <>
      <Tabs
        value={selectedTabIndex === 0 ? CONFIGURATION_TAB : SSL_TAB}
        onValueChange={(value) => setSelectedTabIndex(value === CONFIGURATION_TAB ? 0 : 1)}
        className="mb-4"
      >
        <TabsList variant={scopeVariant}>
          <TabsTrigger value={CONFIGURATION_TAB}>Configuration</TabsTrigger>
          <TabsTrigger value={SSL_TAB}>SSL ({sslEnabled ? "Enabled" : "Disabled"})</TabsTrigger>
        </TabsList>
        <TabsContent value={CONFIGURATION_TAB}>
          <div className="flex items-start gap-2">
            <Controller
              name="credentials.host"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel htmlFor="sql-host">Host</FieldLabel>
                  <Input
                    id="sql-host"
                    {...field}
                    disabled={isPlatformManagedCredentials}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.database"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel htmlFor="sql-database">Database Name</FieldLabel>
                  <Input
                    id="sql-database"
                    {...field}
                    disabled={isPlatformManagedCredentials}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="w-28">
                  <FieldLabel htmlFor="sql-port">Port</FieldLabel>
                  <Input
                    id="sql-port"
                    type="number"
                    {...field}
                    disabled={isPlatformManagedCredentials}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </div>
          <div className="mt-4 flex items-start gap-2">
            <Controller
              name="credentials.username"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel htmlFor="sql-username">Username</FieldLabel>
                  <Input
                    id="sql-username"
                    {...field}
                    disabled={isPlatformManagedCredentials}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.password"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>Password</FieldLabel>
                  <SecretInput
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    isDisabled={isPlatformManagedCredentials}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </div>
        </TabsContent>
        <TabsContent value={SSL_TAB}>
          <Controller
            name="credentials.sslEnabled"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <Field orientation="horizontal">
                  <FieldContent>
                    <Label htmlFor="ssl-enabled">Enable SSL</Label>
                  </FieldContent>
                  <Switch
                    id="ssl-enabled"
                    variant={scopeVariant}
                    checked={value}
                    onCheckedChange={onChange}
                    disabled={isPlatformManagedCredentials}
                  />
                </Field>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="credentials.sslCertificate"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className={sslEnabled ? "mb-4" : "mb-4 opacity-50"}>
                <FieldLabel htmlFor="ssl-certificate">
                  SSL Certificate <span className="text-muted">(optional)</span>
                </FieldLabel>
                <TextArea
                  id="ssl-certificate"
                  className="h-14 resize-none"
                  {...field}
                  disabled={isPlatformManagedCredentials || !sslEnabled}
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="credentials.sslRejectUnauthorized"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className={sslEnabled ? undefined : "opacity-50"}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <Label htmlFor="ssl-reject-unauthorized">Reject Unauthorized</Label>
                    <FieldDescription>
                      If enabled, Infisical will only connect to the server if it has a valid,
                      trusted SSL certificate.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="ssl-reject-unauthorized"
                    variant={scopeVariant}
                    checked={sslEnabled ? value : false}
                    onCheckedChange={onChange}
                    disabled={isPlatformManagedCredentials || !sslEnabled}
                  />
                </Field>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </TabsContent>
      </Tabs>
      {!isPlatformManagedCredentials && (
        <Controller
          name="isPlatformManagedCredentials"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="platform-managed">Platform Managed Credentials</Label>
                  <FieldDescription>
                    If enabled, Infisical will manage the credentials of this App Connection by
                    updating the password on creation.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="platform-managed"
                  variant={scopeVariant}
                  checked={value}
                  onCheckedChange={onChange}
                  disabled={isPlatformManagedCredentials}
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
