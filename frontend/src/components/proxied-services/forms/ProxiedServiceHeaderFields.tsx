import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";

import { HeaderRewritingMode, TProxiedServiceForm } from "./schema";
import { SecretSelect } from "./SecretSelect";

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
};

export const ProxiedServiceHeaderFields = ({ projectId, environment, secretPath }: Props) => {
  const {
    control,
    register,
    watch,
    setValue,
    clearErrors,
    formState: { errors }
  } = useFormContext<TProxiedServiceForm>();

  const headerMode = watch("headerMode");
  const headerFields = useFieldArray({ control, name: "headers" });

  const handleModeChange = (value: string) => {
    setValue("headerMode", value as HeaderRewritingMode);
    // Drop any validation errors from the mode we just left so they neither block
    // navigation nor show up on the now-hidden tab.
    clearErrors(["headers", "basicAuth"]);
  };

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={headerMode} onValueChange={handleModeChange}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Header Rewrites</p>
            <p className="mt-1 text-xs text-muted">Sets these headers on every request.</p>
          </div>
          <TabsList>
            <TabsTrigger value={HeaderRewritingMode.Headers}>Custom Headers</TabsTrigger>
            <TabsTrigger value={HeaderRewritingMode.BasicAuth}>Basic Auth</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={HeaderRewritingMode.Headers} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4">
            {headerFields.fields.length === 0 && (
              <p className="text-center text-sm text-muted">
                No headers added. Click below to add.
              </p>
            )}
            {headerFields.fields.map((row, i) => (
              <div key={row.id} className="flex items-start gap-3">
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Name</FieldLabel>}
                  <FieldContent>
                    <Input
                      placeholder="Authorization"
                      isError={Boolean(errors.headers?.[i]?.headerName)}
                      {...register(`headers.${i}.headerName`)}
                    />
                    <FieldError errors={[errors.headers?.[i]?.headerName]} />
                  </FieldContent>
                </Field>
                <Field className="w-28">
                  {i === 0 && <FieldLabel className="text-xs">Prefix</FieldLabel>}
                  <FieldContent>
                    <Input placeholder="Bearer" {...register(`headers.${i}.headerPrefix`)} />
                  </FieldContent>
                </Field>
                <Field className="flex-1">
                  {i === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`headers.${i}.secretKey`}
                      render={({ field }) => (
                        <SecretSelect
                          projectId={projectId}
                          environment={environment}
                          secretPath={secretPath}
                          value={field.value}
                          onChange={field.onChange}
                          isError={Boolean(errors.headers?.[i]?.secretKey)}
                        />
                      )}
                    />
                    <FieldError errors={[errors.headers?.[i]?.secretKey]} />
                  </FieldContent>
                </Field>
                <IconButton
                  variant="ghost"
                  size="xs"
                  type="button"
                  aria-label="Remove header"
                  className={twMerge(
                    i === 0 ? "mt-6.5" : "mt-0.5",
                    "transition-transform hover:text-danger"
                  )}
                  onClick={() => headerFields.remove(i)}
                >
                  <TrashIcon className="size-4" />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={() =>
                headerFields.append({ secretKey: "", headerName: "", headerPrefix: "" })
              }
            >
              <PlusIcon className="mr-1 size-4" />
              Add Header
            </Button>
          </div>
        </TabsContent>

        <TabsContent value={HeaderRewritingMode.BasicAuth}>
          <div className="flex gap-3 rounded-md border border-border bg-container/50 p-4">
            <Field className="flex-1">
              <FieldLabel>Username</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="basicAuth.usernameSecretKey"
                  render={({ field }) => (
                    <SecretSelect
                      projectId={projectId}
                      environment={environment}
                      secretPath={secretPath}
                      value={field.value}
                      onChange={field.onChange}
                      isError={Boolean(errors.basicAuth?.usernameSecretKey)}
                    />
                  )}
                />
                <FieldError errors={[errors.basicAuth?.usernameSecretKey]} />
              </FieldContent>
            </Field>
            <Field className="flex-1">
              <FieldLabel>
                Password
                <span className="ml-1 font-normal text-muted">(optional)</span>
              </FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="basicAuth.passwordSecretKey"
                  render={({ field }) => (
                    <SecretSelect
                      projectId={projectId}
                      environment={environment}
                      secretPath={secretPath}
                      value={field.value}
                      onChange={field.onChange}
                      isError={Boolean(errors.basicAuth?.passwordSecretKey)}
                    />
                  )}
                />
                <FieldError errors={[errors.basicAuth?.passwordSecretKey]} />
              </FieldContent>
            </Field>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
