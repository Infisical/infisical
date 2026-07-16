import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  Switch,
  TextArea
} from "@app/components/v3";
import { TOauthClient, useCreateOauthClient, useUpdateOauthClient } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isValidRedirectUri = (uri: string) => {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
      return LOOPBACK_HOSTNAMES.has(parsed.hostname.replace(/^\[|\]$/g, ""));
    }
    return false;
  } catch {
    return false;
  }
};

const oauthClientFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  description: z.string().trim().max(256).optional(),
  redirectUris: z
    .string()
    .trim()
    .min(1, "At least one redirect URI is required")
    .superRefine((value, ctx) => {
      const uris = value
        .split("\n")
        .map((uri) => uri.trim())
        .filter(Boolean);
      const invalidUri = uris.find((uri) => !isValidRedirectUri(uri));
      if (invalidUri) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid redirect URI: ${invalidUri}`
        });
      }
    }),
  requirePkce: z.boolean()
});

type TOauthClientForm = z.infer<typeof oauthClientFormSchema>;

type Props = {
  popUp: UsePopUpState<["clientForm"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["clientForm"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["clientForm"]>, state?: boolean) => void;
  onCreated?: (client: TOauthClient, clientSecret: string) => void;
};

export const OauthClientModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle,
  onCreated
}: Props) => {
  const editingClient = popUp?.clientForm?.data as TOauthClient | undefined;
  const isEditing = Boolean(editingClient);

  const { control, handleSubmit, reset } = useForm<TOauthClientForm>({
    resolver: zodResolver(oauthClientFormSchema),
    defaultValues: {
      name: "",
      description: "",
      redirectUris: "",
      requirePkce: false
    }
  });

  useEffect(() => {
    if (popUp?.clientForm?.isOpen) {
      reset({
        name: editingClient?.name ?? "",
        description: editingClient?.description ?? "",
        redirectUris: editingClient?.redirectUris?.join("\n") ?? "",
        requirePkce: editingClient?.requirePkce ?? false
      });
    }
  }, [popUp?.clientForm?.isOpen]);

  const { mutateAsync: createOauthClient, isPending: isCreating } = useCreateOauthClient();
  const { mutateAsync: updateOauthClient, isPending: isUpdating } = useUpdateOauthClient();

  const onFormSubmit = async ({
    name,
    description,
    redirectUris,
    requirePkce
  }: TOauthClientForm) => {
    const parsedRedirectUris = redirectUris
      .split("\n")
      .map((uri) => uri.trim())
      .filter(Boolean);

    try {
      if (isEditing && editingClient) {
        await updateOauthClient({
          clientDbId: editingClient.id,
          name,
          description: description || null,
          redirectUris: parsedRedirectUris,
          requirePkce
        });
        createNotification({
          text: "Successfully updated OAuth application",
          type: "success"
        });
      } else {
        const { client, clientSecret } = await createOauthClient({
          name,
          description: description || undefined,
          redirectUris: parsedRedirectUris,
          requirePkce
        });
        createNotification({
          text: "Successfully created OAuth application",
          type: "success"
        });
        onCreated?.(client, clientSecret);
      }
      handlePopUpClose("clientForm");
      reset();
    } catch (error) {
      createNotification({
        text:
          (error as Error)?.message ||
          `Failed to ${isEditing ? "update" : "create"} OAuth application`,
        type: "error"
      });
    }
  };

  return (
    <Dialog
      open={popUp?.clientForm?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("clientForm", isOpen);
        if (!isOpen) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit OAuth application" : "Add OAuth application"}
          </DialogTitle>
          <DialogDescription>
            External platforms use this application to request delegated access to Infisical on a
            user&apos;s behalf via OAuth 2.0, limited to that user&apos;s permissions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="oauth-client-name">Name</FieldLabel>
                <Input
                  id="oauth-client-name"
                  placeholder="e.g. Coder"
                  isError={Boolean(error)}
                  {...field}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="oauth-client-description">Description (optional)</FieldLabel>
                <Input
                  id="oauth-client-description"
                  placeholder="What this application is used for"
                  isError={Boolean(error)}
                  {...field}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="redirectUris"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="oauth-client-redirect-uris">Redirect URIs</FieldLabel>
                <TextArea
                  id="oauth-client-redirect-uris"
                  placeholder="https://coder.example.com/external-auth/infisical/callback"
                  rows={3}
                  {...field}
                />
                <FieldDescription>
                  One URI per line. The authorization flow only redirects to these exact URIs.
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="requirePkce"
            render={({ field: { value, onChange } }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Require PKCE (S256)</FieldTitle>
                  <FieldDescription>
                    Reject authorization requests that do not include a PKCE code challenge.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="oauth-client-require-pkce"
                  variant="org"
                  checked={value}
                  onCheckedChange={onChange}
                />
              </Field>
            )}
          />
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => handlePopUpClose("clientForm")}>
              Cancel
            </Button>
            <Button
              variant="org"
              type="submit"
              isPending={isCreating || isUpdating}
              isDisabled={isCreating || isUpdating}
            >
              {isEditing ? "Save Changes" : "Create Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
