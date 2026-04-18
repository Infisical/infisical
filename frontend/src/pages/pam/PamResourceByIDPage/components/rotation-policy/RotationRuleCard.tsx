import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
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
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="mr-1 text-lg font-medium text-muted">{index + 1}</span>
          <Select
            value={rule.enabled ? "include" : "exclude"}
            onValueChange={(value) => onUpdate({ enabled: value === "include" })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="include">Rotate</SelectItem>
              <SelectItem value="exclude">Do Not Rotate</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field>
          <FieldLabel>Rule Name</FieldLabel>
          <FieldContent>
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="e.g., Service accounts"
            />
          </FieldContent>
        </Field>
        <div className="flex gap-4">
          <Field className="flex-1">
            <FieldLabel>Account Name Pattern</FieldLabel>
            <FieldContent>
              <Input
                value={localPattern}
                onChange={(e) => setLocalPattern(e.target.value)}
                onBlur={handlePatternBlur}
                placeholder="*"
                className="font-mono"
              />
            </FieldContent>
          </Field>
          {rule.enabled && (
            <Field className="w-40">
              <FieldLabel>Interval (days)</FieldLabel>
              <FieldContent>
                <Input
                  value={localInterval}
                  onChange={(e) => setLocalInterval(e.target.value)}
                  onBlur={handleIntervalBlur}
                />
              </FieldContent>
            </Field>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-1">
        <IconButton variant="ghost" size="xs" onClick={onDelete}>
          <TrashIcon className="text-danger" />
        </IconButton>
        <IconButton variant="ghost" size="xs" onClick={onMoveUp} isDisabled={index === 0}>
          <ArrowUpIcon />
        </IconButton>
        <IconButton
          variant="ghost"
          size="xs"
          onClick={onMoveDown}
          isDisabled={index >= totalRules - 1}
        >
          <ArrowDownIcon />
        </IconButton>
      </div>
    </div>
  );
};
