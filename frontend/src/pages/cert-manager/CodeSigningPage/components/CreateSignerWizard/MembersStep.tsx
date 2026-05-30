import { useState } from "react";
import { HardDriveIcon, UserIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  SignerMemberRole,
  signerMemberRoleDescriptions,
  signerMemberRoleLabels
} from "@app/hooks/api/signers";

import { WizardAddMemberModal } from "../WizardAddMemberModal";
import { KIND_LABEL, MemberKind, MemberOption, WizardState } from "./types";

type MembersStepProps = {
  userOptions: MemberOption[];
  identityOptions: MemberOption[];
  groupOptions: MemberOption[];
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  isUsersLoading: boolean;
  isIdentitiesLoading: boolean;
  isGroupsLoading: boolean;
  creator: { id: string; label: string };
};

const KindIcon = ({ kind }: { kind: MemberKind }) => {
  // eslint-disable-next-line no-nested-ternary
  const Icon = kind === "user" ? UserIcon : kind === "identity" ? HardDriveIcon : UsersIcon;
  return <Icon className="h-3.5 w-3.5 text-mineshaft-300" />;
};

export const MembersStep = ({
  userOptions,
  identityOptions,
  groupOptions,
  state,
  setState,
  isUsersLoading,
  isIdentitiesLoading,
  isGroupsLoading,
  creator
}: MembersStepProps) => {
  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleAdd = (m: {
    kind: MemberKind;
    id: string;
    label: string;
    role: SignerMemberRole;
  }) => {
    setState((prev) => ({ ...prev, pendingMembers: [...prev.pendingMembers, m] }));
  };

  const handleRemove = (kind: MemberKind, id: string) => {
    setState((prev) => ({
      ...prev,
      pendingMembers: prev.pendingMembers.filter((m) => !(m.kind === kind && m.id === id))
    }));
  };

  const handleChangeRole = (kind: MemberKind, id: string, role: SignerMemberRole) => {
    setState((prev) => ({
      ...prev,
      pendingMembers: prev.pendingMembers.map((m) =>
        m.kind === kind && m.id === id ? { ...m, role } : m
      )
    }));
  };

  const takenKeys = new Set(state.pendingMembers.map((m) => `${m.kind}:${m.id}`));

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
          <UserPlusIcon className="h-3.5 w-3.5" />
          <span>Add member</span>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead className="w-28">Type</TableHead>
            <TableHead className="w-40">Role</TableHead>
            <TableHead className="w-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="[&>td]:py-3">
            <TableCell isTruncatable>
              <div className="flex min-w-0 items-center gap-2">
                <KindIcon kind="user" />
                <span className="truncate text-foreground">{creator.label}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="neutral">User</Badge>
            </TableCell>
            <TableCell>
              <Select value={SignerMemberRole.Administrator} disabled>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SignerMemberRole.Administrator}>
                    {signerMemberRoleLabels[SignerMemberRole.Administrator]}
                  </SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell />
          </TableRow>
          {state.pendingMembers.map((m) => (
            <TableRow key={`${m.kind}:${m.id}`} className="[&>td]:py-3">
              <TableCell isTruncatable>
                <div className="flex min-w-0 items-center gap-2">
                  <KindIcon kind={m.kind} />
                  <span className="truncate text-foreground">{m.label}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="neutral">{KIND_LABEL[m.kind]}</Badge>
              </TableCell>
              <TableCell>
                <Select
                  value={m.role}
                  onValueChange={(v) => handleChangeRole(m.kind, m.id, v as SignerMemberRole)}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" sideOffset={4}>
                    {Object.values(SignerMemberRole).map((role) => (
                      <SelectItem
                        key={role}
                        value={role}
                        description={signerMemberRoleDescriptions[role]}
                      >
                        {signerMemberRoleLabels[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleRemove(m.kind, m.id)}
                  aria-label="Remove member"
                >
                  <XIcon className="h-3 w-3 text-muted" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <WizardAddMemberModal
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        userOptions={userOptions}
        identityOptions={identityOptions}
        groupOptions={groupOptions}
        isUsersLoading={isUsersLoading}
        isIdentitiesLoading={isIdentitiesLoading}
        isGroupsLoading={isGroupsLoading}
        takenKeys={takenKeys}
        onAdd={handleAdd}
      />
    </div>
  );
};
