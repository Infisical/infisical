import { useEffect, useState } from "react";
import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";

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
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  SignerMemberRole,
  signerMemberRoleDescriptions,
  signerMemberRoleLabels
} from "@app/hooks/api/signers";

export type WizardMemberKind = "user" | "identity" | "group";
type Option = { value: string; label: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userOptions: Option[];
  identityOptions: Option[];
  groupOptions: Option[];
  isUsersLoading: boolean;
  isIdentitiesLoading: boolean;
  isGroupsLoading: boolean;
  takenKeys: Set<string>;
  onAdd: (member: {
    kind: WizardMemberKind;
    id: string;
    label: string;
    role: SignerMemberRole;
  }) => void;
};

const KIND_LABEL: Record<WizardMemberKind, string> = {
  user: "User",
  identity: "Machine Identity",
  group: "Group"
};

export const WizardAddMemberModal = ({
  isOpen,
  onOpenChange,
  userOptions,
  identityOptions,
  groupOptions,
  isUsersLoading,
  isIdentitiesLoading,
  isGroupsLoading,
  takenKeys,
  onAdd
}: Props) => {
  const [kind, setKind] = useState<WizardMemberKind>("user");
  const [member, setMember] = useState<Option | null>(null);
  const [role, setRole] = useState<SignerMemberRole>(SignerMemberRole.Operator);

  useEffect(() => {
    if (!isOpen) {
      setKind("user");
      setMember(null);
      setRole(SignerMemberRole.Operator);
    }
  }, [isOpen]);

  const optionsByKind: Record<WizardMemberKind, Option[]> = {
    user: userOptions,
    identity: identityOptions,
    group: groupOptions
  };
  const loadingByKind: Record<WizardMemberKind, boolean> = {
    user: isUsersLoading,
    identity: isIdentitiesLoading,
    group: isGroupsLoading
  };
  // eslint-disable-next-line no-nested-ternary
  const Icon = kind === "user" ? UserIcon : kind === "identity" ? HardDriveIcon : UsersIcon;

  const filteredOptions = optionsByKind[kind].filter((o) => !takenKeys.has(`${kind}:${o.value}`));

  const handleAdd = () => {
    if (!member) return;
    onAdd({ kind, id: member.value, label: member.label, role });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Pick a user, machine identity, or group, and the role they should have on this signer.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <FieldContent>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as WizardMemberKind);
                  setMember(null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["user", "identity", "group"] as WizardMemberKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">
                        {/* eslint-disable-next-line no-nested-ternary */}
                        {k === "user" ? (
                          <UserIcon className="h-3.5 w-3.5" />
                        ) : k === "identity" ? (
                          <HardDriveIcon className="h-3.5 w-3.5" />
                        ) : (
                          <UsersIcon className="h-3.5 w-3.5" />
                        )}
                        {KIND_LABEL[k]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>{KIND_LABEL[kind]}</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={loadingByKind[kind]}
                options={filteredOptions}
                value={member}
                onChange={(selected) => setMember((selected as Option | null) ?? null)}
                placeholder={`Pick a ${KIND_LABEL[kind].toLowerCase()}...`}
                noOptionsMessage={() =>
                  `No ${KIND_LABEL[kind].toLowerCase()}s available — they may already be added.`
                }
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Role</FieldLabel>
            <FieldContent>
              <Select value={role} onValueChange={(v) => setRole(v as SignerMemberRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" sideOffset={4}>
                  {Object.values(SignerMemberRole).map((r) => (
                    <SelectItem key={r} value={r} description={signerMemberRoleDescriptions[r]}>
                      {signerMemberRoleLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="project" onClick={handleAdd} isDisabled={!member}>
            <Icon className="h-3.5 w-3.5" />
            <span>Add to signer</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
