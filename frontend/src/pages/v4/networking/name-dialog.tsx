import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { slugSchema } from "@app/lib/schemas";

const nameSchema = slugSchema({ field: "name" });

export const nameError = (name: string, taken: string[] = []) => {
  const result = nameSchema.safeParse(name);
  if (!result.success) return result.error.issues[0]?.message;
  if (taken.includes(name.trim())) return "This name is already taken";
  return undefined;
};

export const NameDialog = ({
  open,
  onOpenChange,
  title,
  description,
  initialName = "",
  placeholder,
  submitLabel,
  taken,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialName?: string;
  placeholder?: string;
  submitLabel: string;
  taken?: string[];
  onSubmit: (name: string) => Promise<unknown>;
}) => {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(initialName);
          setError(undefined);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          id="networking-name"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = nameError(name, taken);
            setError(next);
            if (next) return;
            if (name === initialName) {
              onOpenChange(false);
              return;
            }
            setPending(true);
            try {
              await onSubmit(name.trim());
              onOpenChange(false);
            } catch {
              // The global mutation handler reports the API error.
            } finally {
              setPending(false);
            }
          }}
        >
          <Field label="Name" error={error}>
            <Input
              autoFocus
              autoComplete="off"
              placeholder={placeholder}
              value={name}
              invalid={Boolean(error)}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="networking-name"
            loading={pending}
            disabled={!name.trim()}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
