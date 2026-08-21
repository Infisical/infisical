import { useMemo, useState } from "react";
import { FolderIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  FilterableSelect,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  SecretFolderRole,
  useCreateIdentityFolderAccess,
  useCreateUserFolderAccess,
  useListFolderAccessIdentities,
  useListFolderAccessUsers
} from "@app/hooks/api/folderAccess";

import {
  DEFAULT_TEMPORARY_RANGE,
  FOLDER_ROLE_TIERS,
  TEMPORARY_RANGE_PRESETS
} from "./folder-access.const";
import {
  isValidTemporaryRange,
  TFolderAccessActor,
  toIdentityActor,
  toUserActor
} from "./folder-access.utils";

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
        ...(users?.users ?? []).map(toUserActor),
        ...(identities?.identities ?? []).map(toIdentityActor)
      ]
        .filter((actor) => !actor.access)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users, identities]
  );

  const isRangeValid = !isTemporary || isValidTemporaryRange(range);
  const isSubmitDisabled = !selected.length || !isRangeValid;

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
        actor.type === "user"
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
            <FolderIcon className="size-3.5 shrink-0 text-folder" />
            <span className="truncate font-mono text-accent">{folderPath}</span>
            <Badge variant="project" className="shrink-0">
              {environmentName}
            </Badge>
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
              getOptionValue={(option) => `${option.type}-${option.id}`}
              getOptionLabel={(option) => option.name}
              placeholder="Search users & machine identities"
              noOptionsMessage={() => "No matches found"}
            />
          </div>

          <div className="space-y-2">
            <Label>Permission</Label>
            <RadioGroup value={tier} onValueChange={(value) => setTier(value as SecretFolderRole)}>
              {FOLDER_ROLE_TIERS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`folder-tier-${option.value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    tier === option.value
                      ? "border-project/35 bg-project/5"
                      : "border-border bg-card"
                  }`}
                >
                  <RadioGroupItem
                    id={`folder-tier-${option.value}`}
                    value={option.value}
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted">
                      {option.description}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Temporary access</Label>
            {isTemporary ? (
              <div className="space-y-2">
                <Input
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  placeholder={DEFAULT_TEMPORARY_RANGE}
                  isError={!isRangeValid}
                />
                <div className="flex items-center gap-1.5">
                  {TEMPORARY_RANGE_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="xs"
                      onClick={() => setRange(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto"
                    onClick={() => setIsTemporary(false)}
                  >
                    Remove expiration
                  </Button>
                </div>
                {!isRangeValid && (
                  <p className="text-xs text-danger">Enter a duration such as 30m, 4h or 1d.</p>
                )}
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsTemporary(true)}>
                Add temporary access
              </Button>
            )}
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
