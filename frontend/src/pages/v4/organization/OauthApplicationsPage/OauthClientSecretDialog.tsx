import { Alert, AlertDescription } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { Snippet } from "@infisical/cipher/ui/snippet";

export type TOauthClientSecretData = {
  clientName: string;
  clientId: string;
  clientSecret: string;
};

export const OauthClientSecretDialog = ({
  data,
  onClose
}: {
  data?: TOauthClientSecretData;
  onClose: () => void;
}) => (
  <Dialog open={Boolean(data)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>OAuth client credentials</DialogTitle>
        <DialogDescription>
          Use these credentials to register {data?.clientName || "this application"} as an OAuth
          provider on the external platform.
        </DialogDescription>
      </DialogHeader>
      <Stack gap={16}>
        <Alert tone="warn">
          <Icon name="alert" />
          <AlertDescription>
            The client secret is only shown once. Store it securely. You will not be able to
            retrieve it again, only rotate it.
          </AlertDescription>
        </Alert>
        <Field label="Client ID" wide>
          <Snippet label="Client ID" copyLabel="Copy client ID" value={data?.clientId ?? ""} />
        </Field>
        <Field label="Client secret" wide>
          <Snippet
            label="Client secret"
            copyLabel="Copy client secret"
            value={data?.clientSecret ?? ""}
          />
        </Field>
      </Stack>
      <DialogFooter>
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
