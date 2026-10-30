import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import type { Scope } from "../../model";
import type { PermissionSubject } from "../catalog";
import { emptyRule, type PermissionErrors, type RolePermissions } from "../permissions-model";
import { RuleList, SubjectActions } from "../policies";

export type LayoutProps = {
  scope: Scope;
  draft: RolePermissions;
  subjects: readonly PermissionSubject[];
  editable: boolean;
  reason: string;
  errors?: PermissionErrors;
  onChange: (next: RolePermissions) => void;
  initialSubject?: string;
};

export const setRules = (
  draft: RolePermissions,
  subject: string,
  rules: RolePermissions[string] | undefined
): RolePermissions => {
  const { [subject]: _removed, ...rest } = draft;
  return rules && rules.length ? { ...rest, [subject]: rules } : rest;
};

export const SubjectRulesSheet = ({
  props,
  config,
  onOpenChange
}: {
  props: LayoutProps;
  config?: PermissionSubject;
  onOpenChange: (open: boolean) => void;
}) => {
  const { scope, draft, editable, reason, errors, onChange } = props;
  const rules = config ? (draft[config.subject] ?? []) : [];
  return (
    <Sheet open={Boolean(config)} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        {config && (
          <>
            <SheetHeader>
              <SheetTitle>{config.title}</SheetTitle>
              <SheetDescription>{config.description}</SheetDescription>
            </SheetHeader>
            <SheetSubheader>
              <SubjectActions
                scope={scope}
                config={config}
                disabled={!editable}
                reason={reason}
                onAddRule={() => onChange(setRules(draft, config.subject, [...rules, emptyRule()]))}
              />
            </SheetSubheader>
            <SheetBody>
              {rules.length ? (
                <RuleList
                  scope={scope}
                  config={config}
                  rules={rules}
                  disabled={!editable}
                  reason={reason}
                  errors={errors?.[config.subject]}
                  onChange={(next) => onChange(setRules(draft, config.subject, next))}
                  onRemovePolicy={() => onChange(setRules(draft, config.subject, undefined))}
                />
              ) : (
                <Button
                  variant="outline"
                  icon="plus"
                  disabled={!editable}
                  onClick={() => onChange(setRules(draft, config.subject, [emptyRule()]))}
                >
                  Grant access
                </Button>
              )}
            </SheetBody>
            <SheetFooter>
              <Inline gap={8} justify="end">
                <SheetClose asChild>
                  <Button variant="primary">Done</Button>
                </SheetClose>
              </Inline>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
