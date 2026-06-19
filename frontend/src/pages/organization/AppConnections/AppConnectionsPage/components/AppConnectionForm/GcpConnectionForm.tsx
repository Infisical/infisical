import { Controller, FormProvider, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useToggle } from "@app/hooks";
import { GcpConnectionMethod, TGcpConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGcpConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GCP)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
    credentials: z.object({
      serviceAccountEmail: z.string().email().trim().min(1, "Service account email required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const GcpConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.GCP,
      method: GcpConnectionMethod.ServiceAccountImpersonation
    }
  });
  const { currentOrg } = useOrganization();

  const [isCopied, { timedToggle: toggleIsCopied }] = useToggle(false);
  const expectedAccountIdSuffix = currentOrg.id.split("-").slice(0, 2).join("-");

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="method">
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.GCP].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GcpConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.serviceAccountEmail"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="group mb-4">
              <FieldLabel htmlFor="service-account-email">Service Account Email</FieldLabel>
              <SecretInput
                id="service-account-email"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              {!error && (
                <FieldDescription>
                  <span className="block">
                    {`Service account ID must be suffixed with "${expectedAccountIdSuffix}"`}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconButton
                          variant="ghost-muted"
                          size="xs"
                          aria-label="copy"
                          onClick={() => {
                            if (isCopied) {
                              return;
                            }

                            navigator.clipboard.writeText(expectedAccountIdSuffix);

                            createNotification({
                              text: "Copied to clipboard",
                              type: "info"
                            });

                            toggleIsCopied(2000);
                          }}
                          className="ml-1"
                        >
                          <FontAwesomeIcon
                            icon={!isCopied ? faCopy : faCheck}
                            size="sm"
                            className="cursor-pointer"
                          />
                        </IconButton>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Copy</TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="block">
                    Example:
                    <span className="ml-1">service-account-</span>
                    <span className="font-medium">{expectedAccountIdSuffix}</span>
                    <span>@my-project.iam.gserviceaccount.com</span>
                  </span>
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "Update Credentials" : "Connect to GCP"} />
      </form>
    </FormProvider>
  );
};
