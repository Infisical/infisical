import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Textarea } from "@app/components/v4/ui/textarea";
import { KmipPermission, type TKmipClient } from "@app/hooks/api/kmip/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

import css from "./kmip.module.css";

export const kmipPermissionLabels: Record<KmipPermission, string> = {
  [KmipPermission.Check]: "Check",
  [KmipPermission.Create]: "Create",
  [KmipPermission.Get]: "Get",
  [KmipPermission.Locate]: "Locate",
  [KmipPermission.Destroy]: "Destroy",
  [KmipPermission.Activate]: "Activate",
  [KmipPermission.Revoke]: "Revoke",
  [KmipPermission.GetAttributes]: "Get attributes",
  [KmipPermission.Register]: "Register"
};

export const KmipClientSheet = ({
  projectId,
  client,
  onClose
}: {
  projectId: string;
  client?: TKmipClient;
  onClose: () => void;
}) => {
  const kmip = useV4Adapter("kmip");
  const create = kmip.useCreateClient();
  const update = kmip.useUpdateClient();
  const [name, setName] = useState(client?.name ?? "");
  const [description, setDescription] = useState(client?.description ?? "");
  const [permissions, setPermissions] = useState<KmipPermission[]>(client?.permissions ?? []);
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [pending, setPending] = useState(false);
  const verb = client ? "Update" : "Add";

  const submit = async () => {
    const next = {
      name: name.trim() ? undefined : "Name is required",
      description:
        description.length > 500 ? "Description must be at most 500 characters" : undefined
    };
    setErrors(next);
    if (next.name || next.description) return;
    setPending(true);
    try {
      const payload = { projectId, name: name.trim(), description, permissions };
      if (client) await update.mutateAsync({ id: client.id, ...payload });
      else await create.mutateAsync(payload);
      saved(`Successfully ${client ? "updated" : "added"} KMIP client`);
      onClose();
    } catch (error) {
      failed(`Failed to ${verb.toLowerCase()} KMIP client`, error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>{`${verb} KMIP client`}</SheetTitle>
          <SheetDescription>
            Set the client name and the KMIP operations it can run.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="kmip-client"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Name" error={errors.name} wide>
                <Input
                  autoFocus
                  placeholder="my-kmip-client"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="Description" optional error={errors.description} wide>
                <Textarea
                  value={description}
                  aria-invalid={Boolean(errors.description) || undefined}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <Field label="Permissions" group wide>
                <div className={css.permissions}>
                  {Object.values(KmipPermission).map((permission) => (
                    <Checkbox
                      key={permission}
                      label={kmipPermissionLabels[permission]}
                      checked={permissions.includes(permission)}
                      onChange={(checked) =>
                        setPermissions((current) =>
                          checked
                            ? [...current, permission]
                            : current.filter((entry) => entry !== permission)
                        )
                      }
                    />
                  ))}
                </div>
              </Field>
            </Stack>
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="kmip-client" loading={pending}>
              {`${verb} KMIP client`}
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
