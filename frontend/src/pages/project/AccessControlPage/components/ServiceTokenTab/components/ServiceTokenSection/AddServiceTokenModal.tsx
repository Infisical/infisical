import crypto from "crypto";

import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheckIcon, Copy, Info, PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ButtonGroup,
  Checkbox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { useCreateServiceToken } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const apiTokenExpiry = [
  { label: "1 Day", value: 86400 },
  { label: "7 Days", value: 604800 },
  { label: "1 Month", value: 2592000 },
  { label: "6 months", value: 15552000 },
  { label: "12 months", value: 31104000 },
  { label: "Never", value: null }
];

const permissionOptions = [
  { label: "Read (default)", value: "read" },
  { label: "Write (optional)", value: "write" }
] as const;

const schema = z.object({
  name: z.string().max(100),
  scopes: z
    .object({
      environment: z.string().max(50),
      secretPath: z
        .string()
        .min(1, "Secret path cannot be empty")
        .default("/")
        .transform((val) =>
          typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
        )
    })
    .array()
    .min(1),
  expiresIn: z.string().optional(),
  permissions: z
    .object({
      read: z.boolean(),
      readValue: z.boolean(),
      write: z.boolean()
    })
    .required()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["createAPIToken"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["createAPIToken"]>, state?: boolean) => void;
};

const ServiceTokenForm = () => {
  const { t } = useTranslation();

  const { currentProject } = useProject();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      scopes: [
        {
          secretPath: "/",
          environment: currentProject?.environments?.[0]?.slug
        }
      ]
    }
  });

  const { fields: tokenScopes, append, remove } = useFieldArray({ control, name: "scopes" });
  const isOnlyScope = tokenScopes.length === 1;

  const [newToken, setToken] = useState("");
  const [, isTokenCopied, setTokenCopied] = useTimedReset<string>({ initialState: "" });

  const createServiceToken = useCreateServiceToken();
  const hasServiceToken = Boolean(newToken);

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(newToken);
    setTokenCopied("copied");
  };

  const onFormSubmit = async ({ name, scopes, expiresIn, permissions }: FormData) => {
    if (!currentProject?.id) return;

    const randomBytes = crypto.randomBytes(16).toString("hex");

    const { serviceToken } = await createServiceToken.mutateAsync({
      encryptedKey: "",
      iv: "",
      tag: "",
      scopes,
      expiresIn: Number(expiresIn),
      name,
      workspaceId: currentProject.id,
      randomBytes,
      permissions: Object.entries(permissions)
        .filter(([, permissionsValue]) => permissionsValue)
        .map(([permissionsKey]) => permissionsKey)
    });

    setToken(serviceToken);
    createNotification({
      text: "Successfully created a service token",
      type: "success"
    });
  };

  return (
    <>
      <form
        id="add-service-token-form"
        onSubmit={handleSubmit(onFormSubmit)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          {hasServiceToken ? (
            <>
              <Field>
                <FieldLabel>{t("section.token.add-dialog.copy-service-token")}</FieldLabel>
                <ButtonGroup className="w-full">
                  <Input
                    value={newToken}
                    readOnly
                    aria-label="Service token"
                    className="font-mono"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        variant="outline"
                        aria-label="Copy service token"
                        onClick={copyTokenToClipboard}
                      >
                        {isTokenCopied ? <ClipboardCheckIcon /> : <Copy />}
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>{isTokenCopied ? "Copied" : "Copy"}</TooltipContent>
                  </Tooltip>
                </ButtonGroup>
              </Field>
              <Alert variant="info">
                <Info />
                <AlertTitle>Copy this token now</AlertTitle>
                <AlertDescription>
                  {t("section.token.add-dialog.copy-service-token-description")}
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <>
              <Controller
                control={control}
                name="name"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>{t("section.token.add-dialog.name")}</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        autoFocus
                        isError={Boolean(error)}
                        placeholder="Type your token name"
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <div className="flex flex-col gap-3">
                {tokenScopes.map(({ id }, index) => (
                  <div className="flex items-start gap-2" key={id}>
                    <Controller
                      control={control}
                      name={`scopes.${index}.environment`}
                      defaultValue={currentProject?.environments?.[0]?.slug}
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <Field className="min-w-0 flex-1">
                          {index === 0 && <FieldLabel>Environment</FieldLabel>}
                          <FieldContent>
                            <Select value={value} onValueChange={onChange}>
                              <SelectTrigger isError={Boolean(error)} className="w-full">
                                <SelectValue placeholder="Select environment">
                                  <span className="truncate">
                                    {
                                      currentProject?.environments.find((env) => env.slug === value)
                                        ?.name
                                    }
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {currentProject?.environments.map(({ name, slug }) => (
                                  <SelectItem value={slug} key={slug}>
                                    {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FieldError errors={[error]} />
                          </FieldContent>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`scopes.${index}.secretPath`}
                      defaultValue="/"
                      render={({ field, fieldState: { error } }) => (
                        <Field className="min-w-0 flex-1">
                          {index === 0 && <FieldLabel>Secrets Path</FieldLabel>}
                          <FieldContent>
                            <Input
                              {...field}
                              isError={Boolean(error)}
                              placeholder="can be /, /nested/**, /**/deep"
                            />
                            <FieldError errors={[error]} />
                          </FieldContent>
                        </Field>
                      )}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper so the tooltip surfaces on keyboard focus while the trash button is disabled */
                          tabIndex={isOnlyScope ? 0 : -1}
                          className={index === 0 ? "mt-6" : undefined}
                        >
                          <IconButton
                            variant="ghost"
                            type="button"
                            aria-label="Remove scope"
                            className="hover:text-danger"
                            isDisabled={isOnlyScope}
                            onClick={() => remove(index)}
                          >
                            <TrashIcon />
                          </IconButton>
                        </span>
                      </TooltipTrigger>
                      {isOnlyScope && (
                        <TooltipContent>At least one scope is required</TooltipContent>
                      )}
                    </Tooltip>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  className="w-fit"
                  onClick={() =>
                    append({
                      environment: currentProject?.environments?.[0]?.slug || "",
                      secretPath: "/"
                    })
                  }
                >
                  <PlusIcon className="mr-1 size-4" />
                  Add Scope
                </Button>
              </div>
              <Controller
                control={control}
                name="expiresIn"
                defaultValue={String(apiTokenExpiry?.[0]?.value)}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Expiration</FieldLabel>
                    <FieldContent>
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger isError={Boolean(error)} className="w-full">
                          <SelectValue placeholder="Select expiration" />
                        </SelectTrigger>
                        <SelectContent>
                          {apiTokenExpiry.map(({ label, value: optionValue }) => (
                            <SelectItem value={String(optionValue)} key={label}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="permissions"
                defaultValue={{
                  read: true,
                  readValue: false,
                  write: false
                }}
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FieldSet>
                    <FieldLegend className="mb-4" variant="label">
                      Permissions
                    </FieldLegend>
                    <FieldGroup className="p-4">
                      {permissionOptions.map(({ label, value: optionValue }) => (
                        <Field key={optionValue} orientation="horizontal">
                          <Checkbox
                            id={`permission-${optionValue}`}
                            variant="project"
                            isChecked={value[optionValue]}
                            isDisabled={optionValue === "read"}
                            onCheckedChange={(state) =>
                              onChange({
                                ...value,
                                [optionValue]: Boolean(state)
                              })
                            }
                          />
                          <FieldLabel
                            htmlFor={`permission-${optionValue}`}
                            className="cursor-pointer"
                          >
                            {label}
                          </FieldLabel>
                        </Field>
                      ))}
                    </FieldGroup>
                    <FieldError errors={[error]} />
                  </FieldSet>
                )}
              />
            </>
          )}
        </div>
      </form>
      <SheetFooter className="border-t">
        {hasServiceToken ? (
          <SheetClose asChild>
            <Button type="button" variant="project">
              Done
            </Button>
          </SheetClose>
        ) : (
          <>
            <Button
              type="submit"
              form="add-service-token-form"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Create
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" isDisabled={isSubmitting}>
                Cancel
              </Button>
            </SheetClose>
          </>
        )}
      </SheetFooter>
    </>
  );
};

export const AddServiceTokenModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { t } = useTranslation();

  const { currentProject } = useProject();

  const isOpen = popUp?.createAPIToken?.isOpen;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => handlePopUpToggle("createAPIToken", open)}>
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>
            {t("section.token.add-dialog.title", {
              target: currentProject?.name
            })}
          </SheetTitle>
          <SheetDescription>{t("section.token.add-dialog.description")}</SheetDescription>
        </SheetHeader>
        <ServiceTokenForm key={String(isOpen)} />
      </SheetContent>
    </Sheet>
  );
};
