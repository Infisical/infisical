import { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Alert,
  AlertDescription,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  auditLogEventClassToDescriptionMap,
  auditLogEventClassToNameMap
} from "@app/hooks/api/auditLogSettings/constants";
import { AuditLogEventClass } from "@app/hooks/api/auditLogSettings/types";
import { ScopeVariant } from "@app/hooks/useScopeVariant";

type Props = {
  eventClass: AuditLogEventClass;
  isEnabled: boolean;
  variant: ScopeVariant;
  lockedReason?: string;
  isDisabled?: boolean;
  onCheckedChange?: (isEnabled: boolean) => void;
  descriptionExtra?: ReactNode;
  warning?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export const AuditLogEventClassRow = ({
  eventClass,
  isEnabled,
  variant,
  lockedReason,
  isDisabled,
  onCheckedChange,
  descriptionExtra,
  warning,
  badge,
  action,
  className
}: Props) => {
  const id = `audit-log-event-class-${eventClass}`;
  let status = isEnabled ? "Recording" : "Not recorded";
  if (lockedReason && !isEnabled) status = lockedReason;

  const toggle = (
    <Toggle
      id={id}
      variant={variant}
      checked={isEnabled}
      disabled={Boolean(lockedReason) || isDisabled}
      onCheckedChange={onCheckedChange}
      aria-label={`${auditLogEventClassToNameMap[eventClass]} events`}
    />
  );

  return (
    <Field orientation="horizontal" className={twMerge("gap-8 px-6 py-6", className)}>
      <FieldContent>
        <FieldTitle className="text-base">
          <label htmlFor={id}>{auditLogEventClassToNameMap[eventClass]}</label>
          {badge}
        </FieldTitle>
        <FieldDescription className="max-w-2xl text-sm text-accent">
          {auditLogEventClassToDescriptionMap[eventClass]}
        </FieldDescription>
        {descriptionExtra && (
          <FieldDescription className="max-w-2xl text-sm text-accent">
            {descriptionExtra}
          </FieldDescription>
        )}
        {warning && (
          <Alert variant="warning" className="mt-2 max-w-2xl">
            <TriangleAlert />
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}
      </FieldContent>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {lockedReason ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{toggle}</span>
            </TooltipTrigger>
            <TooltipContent side="left">{lockedReason}</TooltipContent>
          </Tooltip>
        ) : (
          toggle
        )}
        <span className="max-w-48 text-right text-sm text-muted">{status}</span>
        {action}
      </div>
    </Field>
  );
};
