import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Field,
  FieldContent,
  FieldLabel,
  Label,
  Switch,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";

const formatIntervalDays = (seconds: number) => {
  const days = Math.round(seconds / 86400);
  return days.toString();
};

export type LocalRule = {
  id: string;
  name: string | null;
  namePattern: string;
  enabled: boolean;
  intervalSeconds: number | null;
};

type Props = {
  rule: LocalRule;
  index: number;
  totalRules: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (
    updates: Partial<Pick<LocalRule, "name" | "namePattern" | "enabled" | "intervalSeconds">>
  ) => void;
};

export const RotationRuleCard = ({
  rule,
  index,
  totalRules,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdate
}: Props) => {
  const [localName, setLocalName] = useState(rule.name ?? "");
  const [localPattern, setLocalPattern] = useState(rule.namePattern);
  const [localInterval, setLocalInterval] = useState(
    rule.intervalSeconds ? formatIntervalDays(rule.intervalSeconds) : "30"
  );

  useEffect(() => {
    setLocalName(rule.name ?? "");
    setLocalPattern(rule.namePattern);
    setLocalInterval(rule.intervalSeconds ? formatIntervalDays(rule.intervalSeconds) : "30");
  }, [rule]);

  const handleNameBlur = () => {
    if (localName !== (rule.name ?? "")) {
      onUpdate({ name: localName || null });
    }
  };

  const handlePatternBlur = () => {
    if (localPattern !== rule.namePattern && localPattern.trim()) {
      onUpdate({ namePattern: localPattern });
    }
  };

  const handleIntervalBlur = () => {
    const days = parseInt(localInterval, 10);
    if (!Number.isNaN(days) && days > 0) {
      const seconds = days * 86400;
      if (seconds !== rule.intervalSeconds) {
        onUpdate({ intervalSeconds: seconds });
      }
    }
  };

  return (
    <div className="flex gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="mr-1 text-lg font-medium text-muted">{index + 1}</span>
          <Switch
            id={`rule-enabled-${rule.id}`}
            checked={rule.enabled}
            onCheckedChange={(checked) => onUpdate({ enabled: checked })}
            variant="project"
          />
          {rule.enabled ? (
            <Label>Rotate</Label>
          ) : (
            <Label className="opacity-50">Do Not Rotate</Label>
          )}
        </div>
        <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
          <Field>
            <FieldLabel>Rule Name</FieldLabel>
            <FieldContent>
              <UnstableInput
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={handleNameBlur}
                placeholder="e.g., Service accounts"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Account Pattern</FieldLabel>
            <FieldContent>
              <UnstableInput
                value={localPattern}
                onChange={(e) => setLocalPattern(e.target.value)}
                onBlur={handlePatternBlur}
                placeholder="*"
                className="font-mono"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Interval (days)</FieldLabel>
            <FieldContent>
              <UnstableInput
                value={localInterval}
                onChange={(e) => setLocalInterval(e.target.value)}
                onBlur={handleIntervalBlur}
                className={twMerge(!rule.enabled && "opacity-50")}
                disabled={!rule.enabled}
              />
            </FieldContent>
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <UnstableIconButton variant="ghost" size="xs" onClick={onDelete}>
          <TrashIcon className="text-danger" />
        </UnstableIconButton>
        <UnstableIconButton variant="ghost" size="xs" onClick={onMoveUp} isDisabled={index === 0}>
          <ArrowUpIcon />
        </UnstableIconButton>
        <UnstableIconButton
          variant="ghost"
          size="xs"
          onClick={onMoveDown}
          isDisabled={index >= totalRules - 1}
        >
          <ArrowDownIcon />
        </UnstableIconButton>
      </div>
    </div>
  );
};
