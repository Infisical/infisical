import { cloneElement, type ReactElement, useEffect, useMemo, useState } from "react";
import { components, OptionProps } from "react-select";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon
} from "lucide-react";
import RandExp from "randexp";
import { twMerge } from "tailwind-merge";

import { useTimedReset } from "@app/hooks";
import {
  doesRuleCoverScope,
  SecretValidationRuleType,
  TSecretValidationRule,
  TValueConstraints,
  useListSecretValidationRules
} from "@app/hooks/api/secretValidationRules";

import { Badge } from "../../generic/Badge";
import { Button } from "../../generic/Button";
import { Checkbox } from "../../generic/Checkbox";
import { IconButton } from "../../generic/IconButton";
import { Label } from "../../generic/Label";
import { Popover, PopoverContent, PopoverTrigger } from "../../generic/Popover";
import { FilterableSelect } from "../../generic/ReactSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";

type PasswordOptionsType = {
  length: number;
  useUppercase: boolean;
  useLowercase: boolean;
  useNumbers: boolean;
  useSpecialChars: boolean;
};

type RuleOption = {
  label: string;
  value: string;
  matchesCurrentScope: boolean;
};

const NONE_RULE_OPTION: RuleOption = {
  label: "None (Custom Generation)",
  value: "",
  matchesCurrentScope: false
};

// Only a static-secret rule constrains a value a person types; the other two shape a credential the
// platform generates for itself.
const getValueConstraints = (rule: TSecretValidationRule): TValueConstraints | undefined =>
  rule.type === SecretValidationRuleType.StaticSecrets ? rule.valueConstraints : undefined;

const hasValueConstraints = (rule: TSecretValidationRule): boolean =>
  Object.values(getValueConstraints(rule) ?? {}).some((value) => value !== undefined);

const generateFromConstraints = (constraints: TValueConstraints): string => {
  const prefix = constraints.requiredPrefix ?? "";
  const suffix = constraints.requiredSuffix ?? "";
  const regexValue = constraints.regexPattern;
  const minLength = constraints.minLength ?? 16;
  const maxLength = constraints.maxLength ?? 64;

  let middle: string | undefined;

  if (regexValue) {
    // Regex takes full precedence over min/max length constraints
    try {
      middle = new RandExp(new RegExp(regexValue)).gen();
    } catch {
      // Fall through to manual generation if regex is invalid
    }
  }

  if (middle === undefined) {
    middle = "";

    const fixedLength = prefix.length + suffix.length;
    const targetMin = Math.max(minLength - fixedLength, 1);
    const targetMax = Math.max(maxLength - fixedLength, 1);
    const lengthRange = Math.max(targetMax - targetMin, 0);
    const randomLength =
      lengthRange > 0
        ? targetMin + (crypto.getRandomValues(new Uint32Array(1))[0] % (lengthRange + 1))
        : Math.max(targetMin, 1);

    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~!*";
    const randomBytes = new Uint32Array(randomLength);
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < randomLength; i += 1) {
      middle += charset[randomBytes[i] % charset.length];
    }
  }

  return prefix + middle + suffix;
};

// The rule's constraints as chips. Reuse prevention carries no value of its own to show, so it
// reads as a statement rather than a "label: value" pair.
const describeConstraints = (constraints: TValueConstraints) => {
  const chips: { key: string; label: string; value?: string }[] = [];
  const add = (key: string, label: string, value?: string | number) => {
    if (value !== undefined) chips.push({ key, label, value: String(value) });
  };

  add("requiredPrefix", "Prefix", constraints.requiredPrefix);
  add("requiredSuffix", "Suffix", constraints.requiredSuffix);
  add("regexPattern", "Pattern", constraints.regexPattern);
  add("minLength", "Min length", constraints.minLength);
  add("maxLength", "Max length", constraints.maxLength);

  if (constraints.reusePrevention?.previousVersions !== undefined) {
    chips.push({ key: "reusePrevention", label: "Prevent reuse of previous secret values" });
  }

  return chips;
};

const RuleOptionComponent = ({ isSelected, children, ...props }: OptionProps<RuleOption>) => (
  <components.Option isSelected={isSelected} {...props}>
    <div className="flex cursor-pointer flex-row items-center justify-between">
      <div className="flex items-center gap-2 truncate">
        <p className="truncate">{children}</p>
        {props.data.matchesCurrentScope && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="project">
                <ShieldCheckIcon className="size-3" />
                Current scope
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              This validation rule applies to the current environment and folder
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
    </div>
  </components.Option>
);

export type PasswordGeneratorProps = {
  onUsePassword?: (password: string) => void;
  isDisabled?: boolean;
  minLength?: number;
  maxLength?: number;
  projectId?: string;
  secretPath?: string;
  selectedEnvironments?: { slug: string }[];
  trigger?: ReactElement<{ disabled?: boolean }>;
};

export const PasswordGenerator = ({
  onUsePassword,
  isDisabled = false,
  minLength = 12,
  maxLength = 64,
  projectId,
  secretPath,
  selectedEnvironments,
  trigger
}: PasswordGeneratorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy"
  });
  const [refresh, setRefresh] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [passwordOptions, setPasswordOptions] = useState<PasswordOptionsType>({
    length: minLength,
    useUppercase: true,
    useLowercase: true,
    useNumbers: true,
    useSpecialChars: true
  });

  const { data: allRules } = useListSecretValidationRules(
    { projectId: projectId || "" },
    { enabled: Boolean(projectId) }
  );

  const applicableRules = useMemo(
    () => (allRules || []).filter((r) => r.isActive && hasValueConstraints(r)),
    [allRules]
  );

  const ruleOptions: RuleOption[] = useMemo(
    () => [
      NONE_RULE_OPTION,
      ...applicableRules.map((r) => ({
        label: r.name,
        value: r.id,
        matchesCurrentScope:
          selectedEnvironments?.length === 1 &&
          doesRuleCoverScope(r, {
            secretPath,
            environmentSlugs: selectedEnvironments?.map((e) => e.slug)
          })
      }))
    ],
    [applicableRules, secretPath, selectedEnvironments]
  );

  const selectedRule = useMemo(
    () => applicableRules.find((r) => r.id === selectedRuleId),
    [applicableRules, selectedRuleId]
  );

  const selectedRuleOption = useMemo(
    () => ruleOptions.find((o) => o.value === selectedRuleId) || NONE_RULE_OPTION,
    [ruleOptions, selectedRuleId]
  );

  const valueConstraints = useMemo(
    () => (selectedRule ? getValueConstraints(selectedRule) : undefined),
    [selectedRule]
  );

  const hasRegexLengthConflict = Boolean(
    valueConstraints?.regexPattern &&
      (valueConstraints.minLength !== undefined || valueConstraints.maxLength !== undefined)
  );

  // Auto-select matching rule only when exactly one environment is selected
  useEffect(() => {
    if (!applicableRules.length) {
      setSelectedRuleId("");
      return;
    }

    // Multiple environments selected — default to custom
    if (!selectedEnvironments || selectedEnvironments.length !== 1) {
      setSelectedRuleId("");
      return;
    }

    const match = applicableRules.find((rule) =>
      doesRuleCoverScope(rule, {
        secretPath,
        environmentSlugs: selectedEnvironments?.map((e) => e.slug)
      })
    );
    setSelectedRuleId(match?.id || "");
  }, [applicableRules, selectedEnvironments, secretPath]);

  const password = useMemo(() => {
    if (selectedRule && valueConstraints) {
      return generateFromConstraints(valueConstraints);
    }

    const charset = {
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      numbers: "0123456789",
      specialChars: "-_.~!*"
    };

    let availableChars = "";
    if (passwordOptions.useUppercase) availableChars += charset.uppercase;
    if (passwordOptions.useLowercase) availableChars += charset.lowercase;
    if (passwordOptions.useNumbers) availableChars += charset.numbers;
    if (passwordOptions.useSpecialChars) availableChars += charset.specialChars;

    if (availableChars === "") availableChars = charset.lowercase + charset.numbers;

    const randomBytes = new Uint32Array(passwordOptions.length);
    crypto.getRandomValues(randomBytes);
    let newPassword = "";
    for (let i = 0; i < passwordOptions.length; i += 1) {
      newPassword += availableChars[randomBytes[i] % availableChars.length];
    }

    return newPassword;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordOptions, refresh, selectedRule, valueConstraints]);

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(password)
      .then(() => {
        setCopyText("Copied");
      })
      .catch(() => {
        setCopyText("Copy failed");
      });
  };

  const usePassword = () => {
    onUsePassword?.(password);
    setIsOpen(false);
  };

  const showRuleSelector = applicableRules.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger ? (
          cloneElement(trigger, { disabled: isDisabled })
        ) : (
          <IconButton variant="outline" size="md" isDisabled={isDisabled}>
            <KeyRoundIcon />
          </IconButton>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[30rem]" align="end">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium">Generate Random Value</p>
            <p className="mt-0.5 text-xs text-muted">Generate strong unique values</p>
          </div>

          {showRuleSelector && (
            <div>
              <Label className="mb-1.5 flex items-center gap-1.5 text-xs text-accent">
                <ShieldCheckIcon className="size-3" />
                Conform to Validation Rule
              </Label>
              <FilterableSelect<RuleOption>
                options={ruleOptions}
                value={selectedRuleOption}
                onChange={(option) => {
                  setSelectedRuleId((option as RuleOption | null)?.value || "");
                  setRefresh((prev) => !prev);
                }}
                getOptionLabel={(o) => o.label}
                getOptionValue={(o) => o.value}
                isClearable={false}
                isSearchable={false}
                components={{ Option: RuleOptionComponent }}
              />
            </div>
          )}

          <div className="rounded-md border border-border bg-container/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex-1 font-mono text-sm break-all select-all">{password}</p>
              <div className="flex shrink-0 gap-1">
                <IconButton variant="ghost" size="xs" onClick={() => setRefresh((prev) => !prev)}>
                  <RefreshCwIcon />
                </IconButton>
                <IconButton variant="ghost" size="xs" onClick={copyToClipboard}>
                  {isCopying ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
              </div>
            </div>
          </div>

          {selectedRule ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-accent">Constraints</Label>
                {hasRegexLengthConflict && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">
                      When a regex pattern is set, it takes precedence over min/max length
                      constraints. Consider defining length requirements directly in your regex
                      pattern instead.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {describeConstraints(valueConstraints ?? {}).map(({ key, label, value }) => (
                  <span key={key} className="text-xs">
                    <span
                      className={twMerge(
                        "font-medium text-muted",
                        value === undefined && "text-label"
                      )}
                    >
                      {label}
                    </span>
                    {value !== undefined && (
                      <>
                        : <span className="font-mono text-label">{value}</span>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs text-accent">Length: {passwordOptions.length}</Label>
                </div>
                <input
                  type="range"
                  min={minLength}
                  max={maxLength}
                  value={passwordOptions.length}
                  onChange={(e) =>
                    setPasswordOptions({
                      ...passwordOptions,
                      length: Number(e.target.value)
                    })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-project [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm"
                />
              </div>

              <div className="flex flex-wrap gap-6">
                <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    variant="project"
                    isChecked={passwordOptions.useUppercase}
                    onCheckedChange={(checked) =>
                      setPasswordOptions({
                        ...passwordOptions,
                        useUppercase: checked as boolean
                      })
                    }
                  />
                  A-Z
                </Label>
                <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    variant="project"
                    isChecked={passwordOptions.useLowercase}
                    onCheckedChange={(checked) =>
                      setPasswordOptions({
                        ...passwordOptions,
                        useLowercase: checked as boolean
                      })
                    }
                  />
                  a-z
                </Label>
                <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    variant="project"
                    isChecked={passwordOptions.useNumbers}
                    onCheckedChange={(checked) =>
                      setPasswordOptions({
                        ...passwordOptions,
                        useNumbers: checked as boolean
                      })
                    }
                  />
                  0-9
                </Label>
                <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    variant="project"
                    isChecked={passwordOptions.useSpecialChars}
                    onCheckedChange={(checked) =>
                      setPasswordOptions({
                        ...passwordOptions,
                        useSpecialChars: checked as boolean
                      })
                    }
                  />
                  -_.~!*
                </Label>
              </div>
            </>
          )}

          {onUsePassword && (
            <Button variant="project" size="xs" onClick={usePassword} className="w-full">
              Use Value
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
