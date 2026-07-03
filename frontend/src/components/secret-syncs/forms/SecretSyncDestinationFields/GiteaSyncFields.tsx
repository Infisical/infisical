import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  useGiteaConnectionListOrganizations,
  useGiteaConnectionListRepositories
} from "@app/hooks/api/appConnections/gitea/queries";
import { TGiteaOrganization, TGiteaRepository } from "@app/hooks/api/appConnections/gitea/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GiteaSyncScope } from "@app/hooks/api/secretSyncs/types/gitea-sync";

import { TSecretSyncForm } from "../schemas";
import { SecretSyncConnectionField } from "../SecretSyncConnectionField";

const GITEA_SYNC_LIST_LIMIT = 20;

export const GiteaSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Gitea }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const chosenScope = useWatch({ name: "destinationConfig.scope", control });
  const chosenRepo = useWatch({ name: "destinationConfig.repo", control });
  const chosenRepoOwner = useWatch({ name: "destinationConfig.owner", control });

  const [repoSearch, setRepoSearch] = useState("");
  const [debouncedRepoSearch] = useDebounce(repoSearch, 300);

  const { data: organizations = [], isPending: isOrganizationsPending } =
    useGiteaConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId) && chosenScope === GiteaSyncScope.Organization
    });

  const { data: repositories, isLoading: isRepositoriesLoading } =
    useGiteaConnectionListRepositories(
      connectionId,
      debouncedRepoSearch || undefined,
      GITEA_SYNC_LIST_LIMIT,
      {
        enabled: Boolean(connectionId) && chosenScope === GiteaSyncScope.Repository
      }
    );

  // The provider only returns the first page, so the currently-selected item may not be in the
  // results. Surface it from the stored name so the selection always renders (e.g. when editing).
  const repositoryOptions = useMemo(() => {
    const results = repositories ?? [];
    if (
      chosenRepo &&
      chosenRepoOwner &&
      !results.some((repo) => repo.owner.name === chosenRepoOwner && repo.name === chosenRepo)
    ) {
      return [{ name: chosenRepo, owner: { name: chosenRepoOwner } }, ...results];
    }
    return results;
  }, [repositories, chosenRepo, chosenRepoOwner]);

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", GiteaSyncScope.Repository);
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.repo", "");
          setValue("destinationConfig.owner", "");
        }}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={GiteaSyncScope.Repository}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Scope</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GiteaSyncScope).map((scope) => (
                    <SelectItem className="capitalize" value={scope} key={scope}>
                      {scope.replace("-", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {chosenScope === GiteaSyncScope.Organization && (
        <Controller
          name="destinationConfig.org"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Organization</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isOrganizationsPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={organizations.find((org) => org.name === value) ?? null}
                  onChange={(option) => {
                    const selected = option as SingleValue<TGiteaOrganization>;
                    onChange(selected?.name ?? null);
                  }}
                  options={organizations}
                  placeholder="Select an organization..."
                  getOptionLabel={(option) => `${option.fullName} (${option.name})`}
                  getOptionValue={(option) => option.name}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      {chosenScope === GiteaSyncScope.Repository && (
        <Controller
          name="destinationConfig.repo"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Repository
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure the repository exists in the connection&apos;s Gitea instance URL and the
                    connection has access to it. Only the first results are shown, search by name to
                    find more.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isRepositoriesLoading && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={repositoryOptions.find((repo) => repo.name === value) ?? null}
                  onChange={(option) => {
                    const repo = option as SingleValue<TGiteaRepository>;
                    onChange(repo?.name);
                    setValue("destinationConfig.owner", repo?.owner.name ?? "");
                  }}
                  onInputChange={(newValue) => setRepoSearch(newValue)}
                  filterOption={null}
                  options={repositoryOptions}
                  placeholder="Search for a repository..."
                  getOptionLabel={(option) => `${option.owner.name}/${option.name}`}
                  getOptionValue={(option) => option.name}
                  noOptionsMessage={({ inputValue }) =>
                    inputValue
                      ? "No repositories found matching your search."
                      : "No repositories found."
                  }
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
