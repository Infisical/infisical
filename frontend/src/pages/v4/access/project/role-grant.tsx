import { useId, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Inline } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import { DurationPicker, type GrantDraft, permanent } from "./temporary-access";

import styles from "./project.module.css";

type RoleOption = { slug: string; name: string };

export const RoleGrantRow = ({
  grant,
  options,
  disabledReason,
  onChange
}: {
  grant: GrantDraft;
  options: readonly RoleOption[];
  disabledReason?: string;
  onChange: (next: GrantDraft) => void;
}) => (
  <div className={styles.grantRow}>
    <div className={styles.grow}>
      <Field label="Role">
        <Select
          label="Role"
          value={grant.role}
          disabled={Boolean(disabledReason)}
          options={options.map((role) => ({ value: role.slug, label: role.name }))}
          onChange={(role) => onChange({ ...grant, role })}
        />
      </Field>
    </div>
    <div className={styles.durationCell}>
      <Field label="Duration">
        <DurationPicker
          label="Duration"
          grant={grant}
          disabledReason={disabledReason}
          onChange={onChange}
        />
      </Field>
    </div>
  </div>
);

export const AddRoleSheet = ({
  open,
  options,
  onOpenChange,
  onAdd
}: {
  open: boolean;
  options: readonly RoleOption[];
  onOpenChange: (open: boolean) => void;
  onAdd: (grant: GrantDraft) => Promise<boolean>;
}) => {
  const formId = useId();
  const [grant, setGrant] = useState(() =>
    permanent(options.find((role) => role.slug === "member")?.slug ?? options[0]?.slug ?? "")
  );
  const [pending, setPending] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>Add role</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            id={formId}
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              const added = await onAdd(grant);
              setPending(false);
              if (added) onOpenChange(false);
            }}
          >
            <RoleGrantRow grant={grant} options={options} onChange={setGrant} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              loading={pending}
              disabled={!grant.role}
            >
              Add role
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
