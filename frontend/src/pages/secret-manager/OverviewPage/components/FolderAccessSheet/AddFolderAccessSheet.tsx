import { useMemo, useState } from "react";
import { FolderIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  FilterableSelect,
  Label,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import {
  SecretFolderRole,
  useCreateIdentityFolderAccess,
  useCreateUserFolderAccess,
  useListFolderAccessIdentities,
  useListFolderAccessUsers
} from "@app/hooks/api/folderAccess";

import { DEFAULT_TEMPORARY_RANGE } from "./folder-access.const";
import { byName, TFolderAccessActor, toIdentityActor, toUserActor } from "./folder-access.utils";
import {
  FolderAccessActorMultiValueLabel,
  FolderAccessActorOption
} from "./FolderAccessActorOption";
import { FolderTierRadioGroup } from "./FolderTierRadioGroup";
import { TemporaryAccessPopover } from "./TemporaryAccessPopover";

const CANDIDATE_LIMIT = 100;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environmentSlug: string;
  folderPath: string;
  environmentName: string;
};

export const AddFolderAccessSheet = ({
  isOpen,
  onOpenChange,
  projectId,
  environmentSlug,
  folderPath,
  environmentName
}: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [selected, setSelected] = useState<TFolderAccessActor[]>([]);
  const [tier, setTier] = useState<SecretFolderRole>(SecretFolderRole.Read);
  const [isTemporary, setIsTemporary] = useState(false);
  const [range, setRange] = useState(DEFAULT_TEMPORARY_RANGE);

  const listArgs = {
    projectId,
    environmentSlug,
    secretPath: folderPath,
    limit: CANDIDATE_LIMIT,
    search: debouncedSearch.trim() || undefined
  };
  const { data: users, isPending: isUsersPending } = useListFolderAccessUsers(listArgs);
  const { data: identities, isPending: isIdentitiesPending } =
    useListFolderAccessIdentities(listArgs);

  const createUserAccess = useCreateUserFolderAccess();
  const createIdentityAccess = useCreateIdentityFolderAccess();

  const candidates = useMemo(
    () =>
      [
        ...(users?.usersWithoutAccess ?? []).map(toUserActor),
        ...(identities?.identitiesWithoutAccess ?? []).map(toIdentityActor)
      ].sort(byName),
    [users, identities]
  );

  // the backend rejects a temporary full-access grant, so the form must not offer one
  const isFullAccessTemporary = tier === SecretFolderRole.FullAccess && isTemporary;
  const isSubmitDisabled = !selected.length || isFullAccessTemporary;

  const reset = () => {
    setSearch("");
    setSelected([]);
    setTier(SecretFolderRole.Read);
    setIsTemporary(false);
    setRange(DEFAULT_TEMPORARY_RANGE);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    const type = isTemporary
      ? ({
          isTemporary: true,
          temporaryMode: "relative",
          temporaryRange: range,
          temporaryAccessStartTime: new Date().toISOString()
        } as const)
      : undefined;

    // no bulk endpoint exists, so each actor is its own request; failures are reported globally
    const results = await Promise.allSettled(
      selected.map((actor) =>
        actor.type === ActorType.USER
          ? createUserAccess.mutateAsync({
              projectId,
              environmentSlug,
              secretPath: folderPath,
              userId: actor.id,
              permission: tier,
              type
            })
          : createIdentityAccess.mutateAsync({
              projectId,
              environmentSlug,
              secretPath: folderPath,
              identityId: actor.id,
              permission: tier,
              type
            })
      )
    );

    const granted = results.filter((result) => result.status === "fulfilled").length;
    if (granted) {
      createNotification({
        text: `Granted folder access to ${granted} ${granted === 1 ? "identity" : "identities"}`,
        type: "success"
      });
    }
    if (granted === selected.length) handleOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="gap-y-0 sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Add Access</SheetTitle>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-xs">
            <Badge variant="project" className="shrink-0">
              {environmentName}
            </Badge>
            <FolderIcon className="size-3.5 shrink-0 text-folder" />
            <span className="truncate font-mono text-accent">{folderPath}</span>
          </div>
        </SheetHeader>

        <div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
          <div className="space-y-2">
            <Label>Users & machine identities</Label>
            <FilterableSelect
              isMulti
              value={selected}
              options={candidates}
              isLoading={isUsersPending || isIdentitiesPending}
              onInputChange={(value, { action }) => {
                if (action === "input-change") setSearch(value);
              }}
              onChange={(value) => setSelected((value ?? []) as TFolderAccessActor[])}
              components={{
                Option: FolderAccessActorOption,
                MultiValueLabel: FolderAccessActorMultiValueLabel
              }}
              getOptionValue={(option) => `${option.type}-${option.id}`}
              getOptionLabel={(option) => option.name}
              // the candidate lists are already searched server side, so the label-only
              // client filter would drop matches found by email or identity metadata
              filterOption={null}
              placeholder="Search users & machine identities"
              noOptionsMessage={({ inputValue }) =>
                inputValue
                  ? "No matches found"
                  : "Every project member already has access to this folder."
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Permission</Label>
            <FolderTierRadioGroup value={tier} onValueChange={setTier} />
            {isFullAccessTemporary && (
              <p className="text-xs text-danger">
                Full Access cannot be temporary. Remove the expiration or choose a lower tier.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Temporary access</Label>
            <TemporaryAccessPopover
              isTemporary={isTemporary}
              range={range}
              label={isTemporary ? `Expires in ${range}` : "No expiration"}
              description="Access is revoked automatically once the duration elapses."
              onApply={(nextRange) => {
                setRange(nextRange);
                setIsTemporary(true);
              }}
              onRemove={() => setIsTemporary(false)}
            />
          </div>
        </div>

        <SheetFooter className="border-t">
          <Button
            variant="project"
            isFullWidth
            isDisabled={isSubmitDisabled}
            isPending={createUserAccess.isPending || createIdentityAccess.isPending}
            onClick={handleSubmit}
          >
            Add Access
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
