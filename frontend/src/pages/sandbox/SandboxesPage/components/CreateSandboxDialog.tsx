import { useState } from "react";
import { BotIcon, ServerIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { SandboxKind, SandboxTemplate, useCreateSandbox } from "@app/hooks/api/sandboxes";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (sandboxId: string) => void;
};

const TEMPLATE_LABELS: Record<SandboxTemplate, string> = {
  [SandboxTemplate.Base]: "Base (bash only)",
  [SandboxTemplate.Python]: "Python 3",
  [SandboxTemplate.Node]: "Node.js",
  [SandboxTemplate.Ops]: "Ops (CLI tooling)"
};

const SIZES = [
  { label: "Small", vcpu: 1, memoryMb: 1024 },
  { label: "Medium", vcpu: 2, memoryMb: 2048 },
  { label: "Large", vcpu: 4, memoryMb: 8192 }
];

const KINDS = [
  {
    kind: SandboxKind.Agent,
    icon: BotIcon,
    title: "Agent",
    blurb: "An AI agent you talk to. Reaches only what you grant it."
  },
  {
    kind: SandboxKind.Vm,
    icon: ServerIcon,
    title: "VM",
    blurb: "A plain machine with a shell. You drive it yourself."
  }
];

export const CreateSandboxDialog = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const createSandbox = useCreateSandbox();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState(SandboxKind.Agent);
  const [template, setTemplate] = useState(SandboxTemplate.Base);
  const [sizeIndex, setSizeIndex] = useState(1);

  const reset = () => {
    setName("");
    setDescription("");
    setKind(SandboxKind.Agent);
    setTemplate(SandboxTemplate.Base);
    setSizeIndex(1);
  };

  const handleCreate = async () => {
    const size = SIZES[sizeIndex];

    const sandbox = await createSandbox.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      kind,
      template,
      vcpu: size.vcpu,
      memoryMb: size.memoryMb
    });

    createNotification({ type: "success", text: `Sandbox "${sandbox.name}" created` });
    reset();
    onOpenChange(false);
    onCreated(sandbox.id);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Sandbox</DialogTitle>
          <DialogDescription>
            An isolated environment. You choose what it can reach after it is created.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                aria-pressed={kind === option.kind}
                onClick={() => setKind(option.kind)}
                className={cn(
                  "rounded-lg border p-3 text-left transition duration-200 ease-in-out",
                  kind === option.kind
                    ? "border-org/40 bg-org/10"
                    : "border-border bg-container hover:bg-container-hover"
                )}
              >
                <div className="flex items-center gap-2">
                  <option.icon
                    className={cn("size-4", kind === option.kind ? "text-org" : "text-muted")}
                  />
                  <span className="text-sm font-medium">{option.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{option.blurb}</p>
              </button>
            ))}
          </div>

          <Field>
            <FieldLabel htmlFor="sandbox-name">Name</FieldLabel>
            <Input
              id="sandbox-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="sales-agent"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="sandbox-description">Description</FieldLabel>
            <TextArea
              id="sandbox-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this sandbox is for"
              rows={2}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="sandbox-template">Template</FieldLabel>
              <Select value={template} onValueChange={(v) => setTemplate(v as SandboxTemplate)}>
                <SelectTrigger id="sandbox-template" className="w-full">
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SandboxTemplate).map((value) => (
                    <SelectItem key={value} value={value}>
                      {TEMPLATE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="sandbox-size">Size</FieldLabel>
              <Select value={String(sizeIndex)} onValueChange={(v) => setSizeIndex(Number(v))}>
                <SelectTrigger id="sandbox-size" className="w-full">
                  <SelectValue placeholder="Choose a size" />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((size, index) => (
                    <SelectItem key={size.label} value={String(index)}>
                      {size.label} · {size.vcpu} vCPU · {size.memoryMb / 1024} GB
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="org"
            onClick={handleCreate}
            isDisabled={!name.trim()}
            isPending={createSandbox.isPending}
          >
            Create Sandbox
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
