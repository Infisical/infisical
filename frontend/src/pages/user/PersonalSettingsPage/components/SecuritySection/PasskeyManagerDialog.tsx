import { useState } from "react";
import { FingerprintIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  useDeleteWebAuthnCredential,
  useGetWebAuthnCredentials,
  useRegisterPasskey
} from "@app/hooks/api/webauthn";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PasskeyManagerDialog = ({ isOpen, onOpenChange }: Props) => {
  const { data: credentials = [], isPending } = useGetWebAuthnCredentials();
  const { registerPasskey, isRegistering } = useRegisterPasskey();
  const { mutateAsync: deleteCredential } = useDeleteWebAuthnCredential();

  const [name, setName] = useState("");

  const handleAdd = async () => {
    if (await registerPasskey(name)) {
      setName("");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCredential({ id });
      createNotification({ text: "Passkey removed", type: "success" });
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to remove passkey",
        type: "error"
      });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Manage passkeys</SheetTitle>
          <SheetDescription>
            Passkeys use Face ID, Touch ID, a security key, or your device to sign in.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New passkey name (optional)"
              />
            </div>
            <Button variant="org" isPending={isRegistering} onClick={handleAdd}>
              <PlusIcon /> Add
            </Button>
          </div>

          {isPending ? (
            <ContentLoader />
          ) : (
            <div className="flex flex-col gap-2">
              {credentials.length === 0 && (
                <p className="rounded-lg border border-border bg-container p-4 text-center text-sm text-muted">
                  No passkeys registered yet.
                </p>
              )}
              {credentials.map((credential) => (
                <div
                  key={credential.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-container p-3"
                >
                  <div className="flex items-center gap-3">
                    <FingerprintIcon className="text-muted" />
                    <div>
                      <p className="text-sm text-foreground">
                        {credential.name || "Unnamed passkey"}
                      </p>
                      <p className="text-xs text-muted">
                        Added {new Date(credential.createdAt).toLocaleDateString()}
                        {credential.lastUsedAt &&
                          ` · Last used ${new Date(credential.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(credential.id)}>
                    <TrashIcon /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
