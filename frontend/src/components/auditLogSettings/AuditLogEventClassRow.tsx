import { ReactNode } from "react";

import {
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
};

export const AuditLogEventClassRow = ({
  eventClass,
  isEnabled,
  variant,
  lockedReason,
  isDisabled,
  onCheckedChange,
  descriptionExtra
}: Props) => {
  const id = `audit-log-event-class-${eventClass}`;

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
    <Field orientation="horizontal" className="gap-8 px-6 py-6">
      <FieldContent>
        <FieldTitle>
          <label htmlFor={id}>{auditLogEventClassToNameMap[eventClass]}</label>
        </FieldTitle>
        <FieldDescription className="max-w-2xl">
          {auditLogEventClassToDescriptionMap[eventClass]}
        </FieldDescription>
        {descriptionExtra && (
          <FieldDescription className="max-w-2xl">{descriptionExtra}</FieldDescription>
        )}
      </FieldContent>
      <div className="shrink-0">
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
      </div>
    </Field>
  );
};
