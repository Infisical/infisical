/* eslint-disable jsx-a11y/label-has-associated-control */
import { Controller, useFormContext } from "react-hook-form";
import { TrashIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { useProject } from "@app/context";

import { TSecretEnforcementForm } from "./SecretEnforcementTab.utils";

type Props = {
  index: number;
  onRemove: () => void;
};

export const StaticSecretRuleCard = ({ index, onRemove }: Props) => {
  const { currentProject } = useProject();
  const { control, watch } = useFormContext<TSecretEnforcementForm>();

  const isEnabled = watch(`staticSecrets.${index}.enabled`);
  const keyPatternEnabled = watch(`staticSecrets.${index}.keyPattern.enabled`);

  return (
    <div className="relative rounded-md border border-l-[6px] border-border border-l-green-600/50 bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Controller
            control={control}
            name={`staticSecrets.${index}.enabled`}
            render={({ field: { value, onChange } }) => (
              <Switch variant="project" checked={value} onCheckedChange={onChange} />
            )}
          />
          <span className="text-sm font-medium text-foreground">
            {isEnabled ? "Enforcement Enabled" : "Enforcement Disabled"}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <UnstableIconButton aria-label="Delete rule" variant="danger" onClick={onRemove}>
              <TrashIcon className="size-4" />
            </UnstableIconButton>
          </TooltipTrigger>
          <TooltipContent side="top">Delete Rule</TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted" htmlFor={`folderPath-${index}`}>
            Folder Path
          </label>
          <Controller
            control={control}
            name={`staticSecrets.${index}.folderPath`}
            render={({ field }) => (
              <UnstableInput
                {...field}
                id={`folderPath-${index}`}
                placeholder="/**"
                disabled={!isEnabled}
              />
            )}
          />
          <span className="text-xs text-muted">Glob pattern for folder scope</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted" htmlFor={`environment-${index}`}>
            Environment
          </label>
          <Controller
            control={control}
            name={`staticSecrets.${index}.environment`}
            render={({ field: { value, onChange } }) => (
              <Select
                value={value || "all"}
                onValueChange={(val) => onChange(val === "all" ? "" : val)}
                disabled={!isEnabled}
              >
                <SelectTrigger id={`environment-${index}`}>
                  <SelectValue placeholder="All Environments" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">All Environments</SelectItem>
                  {currentProject.environments.map((env) => (
                    <SelectItem key={env.slug} value={env.slug}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <Controller
            control={control}
            name={`staticSecrets.${index}.keyPattern.enabled`}
            render={({ field: { value, onChange } }) => (
              <Switch
                variant="project"
                size="sm"
                checked={value}
                onCheckedChange={onChange}
                disabled={!isEnabled}
              />
            )}
          />
          <span className="text-sm text-foreground">Filter by Key Pattern</span>
        </div>
        {keyPatternEnabled && (
          <div className="mt-2 ml-9">
            <Controller
              control={control}
              name={`staticSecrets.${index}.keyPattern.pattern`}
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  placeholder="DB-*"
                  className="w-64"
                  disabled={!isEnabled}
                />
              )}
            />
            <span className="mt-1 block text-xs text-muted">
              Glob pattern to match secret keys (e.g. DB-*, *_TOKEN)
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <h4 className="mb-3 text-sm font-medium text-foreground">Value Requirements</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted" htmlFor={`minLength-${index}`}>
              Minimum Length
            </label>
            <Controller
              control={control}
              name={`staticSecrets.${index}.valueRequirements.minLength`}
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  value={field.value ?? ""}
                  id={`minLength-${index}`}
                  type="number"
                  min={0}
                  placeholder="No minimum"
                  disabled={!isEnabled}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted" htmlFor={`maxLength-${index}`}>
              Maximum Length
            </label>
            <Controller
              control={control}
              name={`staticSecrets.${index}.valueRequirements.maxLength`}
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  value={field.value ?? ""}
                  id={`maxLength-${index}`}
                  type="number"
                  min={0}
                  placeholder="No maximum"
                  disabled={!isEnabled}
                />
              )}
            />
          </div>
        </div>

        <h5 className="mt-4 mb-2 text-xs font-medium text-muted">
          Minimum Required Character Counts
        </h5>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted" htmlFor={`minLowercase-${index}`}>
              Lowercase
            </label>
            <Controller
              control={control}
              name={`staticSecrets.${index}.valueRequirements.minLowercase`}
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  value={field.value ?? ""}
                  id={`minLowercase-${index}`}
                  type="number"
                  min={0}
                  placeholder="0"
                  disabled={!isEnabled}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted" htmlFor={`minUppercase-${index}`}>
              Uppercase
            </label>
            <Controller
              control={control}
              name={`staticSecrets.${index}.valueRequirements.minUppercase`}
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  value={field.value ?? ""}
                  id={`minUppercase-${index}`}
                  type="number"
                  min={0}
                  placeholder="0"
                  disabled={!isEnabled}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted" htmlFor={`minDigits-${index}`}>
              Digits
            </label>
            <Controller
              control={control}
              name={`staticSecrets.${index}.valueRequirements.minDigits`}
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  value={field.value ?? ""}
                  id={`minDigits-${index}`}
                  type="number"
                  min={0}
                  placeholder="0"
                  disabled={!isEnabled}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted" htmlFor={`minSymbols-${index}`}>
              Symbols
            </label>
            <Controller
              control={control}
              name={`staticSecrets.${index}.valueRequirements.minSymbols`}
              render={({ field }) => (
                <UnstableInput
                  {...field}
                  value={field.value ?? ""}
                  id={`minSymbols-${index}`}
                  type="number"
                  min={0}
                  placeholder="0"
                  disabled={!isEnabled}
                />
              )}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <label
            className="text-xs font-medium text-muted"
            htmlFor={`allowedSpecialChars-${index}`}
          >
            Allowed Special Characters (optional)
          </label>
          <Controller
            control={control}
            name={`staticSecrets.${index}.valueRequirements.allowedSpecialChars`}
            render={({ field }) => (
              <UnstableInput
                {...field}
                value={field.value ?? ""}
                id={`allowedSpecialChars-${index}`}
                placeholder="e.g. !@#$%^&*"
                disabled={!isEnabled}
              />
            )}
          />
          <span className="text-xs text-muted">
            If set, only these special characters will be allowed in values
          </span>
        </div>
      </div>
    </div>
  );
};
