import { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

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
};

export const AuditLogEventClassRow = ({
  eventClass,
  isEnabled,
  variant,
  lockedReason,
  isDisabled,
  onCheckedChange,
  descriptionExtra,
  warning
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
        <FieldTitle className="text-base leading-5">
          <label htmlFor={id}>{auditLogEventClassToNameMap[eventClass]}</label>
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
