import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldLabel,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  UnstableInput
} from "@app/components/v3";

import {
  MatchingPattern,
  RotationPolicy,
  RotationPolicyType
} from "../../PamRotationsPage/mock-data";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  policy: RotationPolicy;
};

const emptyPattern = (type: RotationPolicyType): MatchingPattern => {
  if (type === RotationPolicyType.DomainWindows) {
    return { accountNames: "", domainName: "" };
  }
  return { accountNames: "", resourceNames: "" };
};

export const EditMatchingRulesSheet = ({ isOpen, onOpenChange, policy }: Props) => {
  const [rotationIntervalDays, setRotationIntervalDays] = useState(policy.rotationIntervalDays);
  const [allowPattern, setAllowPattern] = useState<MatchingPattern>(
    policy.allowPatterns[0] || emptyPattern(policy.type)
  );
  const [denyPattern, setDenyPattern] = useState<MatchingPattern>(
    policy.denyPatterns[0] || emptyPattern(policy.type)
  );

  useEffect(() => {
    if (isOpen) {
      setRotationIntervalDays(policy.rotationIntervalDays);
      setAllowPattern(policy.allowPatterns[0] || emptyPattern(policy.type));
      setDenyPattern(policy.denyPatterns[0] || emptyPattern(policy.type));
    }
  }, [isOpen, policy]);

  const handleSave = () => {
    onOpenChange(false);
  };

  const isDomain = policy.type === RotationPolicyType.DomainWindows;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit Matching Rules</SheetTitle>
          <SheetDescription>
            Define which accounts to rotate. Deny patterns take priority over allow patterns.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {/* Rotation Interval */}
          <Field>
            <FieldLabel>Rotation Interval</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <UnstableInput
                  type="number"
                  value={rotationIntervalDays}
                  onChange={(e) => setRotationIntervalDays(Number(e.target.value))}
                  className="w-20"
                  min={1}
                />
                <span className="text-sm text-muted">days</span>
              </div>
              <p className="mt-1 text-xs text-muted">How often to rotate matching accounts</p>
            </FieldContent>
          </Field>

          {/* Allow Rule */}
          <div>
            <div className="mb-3">
              <Label>Allow Rule</Label>
              <p className="mt-1 text-xs text-muted">
                Accounts matching these patterns will be rotated
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Account Names</FieldLabel>
                <FieldContent>
                  <UnstableInput
                    value={allowPattern.accountNames}
                    onChange={(e) =>
                      setAllowPattern({ ...allowPattern, accountNames: e.target.value })
                    }
                    placeholder="e.g. app_*, postgres"
                  />
                  <p className="mt-1 text-xs text-muted">Separate multiple patterns with commas</p>
                </FieldContent>
              </Field>
              {isDomain ? (
                <Field>
                  <FieldLabel>Domain Name</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      value={allowPattern.domainName || ""}
                      onChange={(e) =>
                        setAllowPattern({ ...allowPattern, domainName: e.target.value })
                      }
                      placeholder="e.g. corp.example.com"
                    />
                  </FieldContent>
                </Field>
              ) : (
                <Field>
                  <FieldLabel>Resource Names</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      value={allowPattern.resourceNames || ""}
                      onChange={(e) =>
                        setAllowPattern({ ...allowPattern, resourceNames: e.target.value })
                      }
                      placeholder="e.g. prod-*, *"
                    />
                  </FieldContent>
                </Field>
              )}
            </div>
          </div>

          {/* Deny Rule */}
          <div>
            <div className="mb-3">
              <Label>Deny Rule</Label>
              <p className="mt-1 text-xs text-muted">
                Accounts matching these patterns will NOT be rotated (takes priority)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Account Names</FieldLabel>
                <FieldContent>
                  <UnstableInput
                    value={denyPattern.accountNames}
                    onChange={(e) =>
                      setDenyPattern({ ...denyPattern, accountNames: e.target.value })
                    }
                    placeholder="e.g. readonly_*"
                  />
                  <p className="mt-1 text-xs text-muted">Separate multiple patterns with commas</p>
                </FieldContent>
              </Field>
              {isDomain ? (
                <Field>
                  <FieldLabel>Domain Name</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      value={denyPattern.domainName || ""}
                      onChange={(e) =>
                        setDenyPattern({ ...denyPattern, domainName: e.target.value })
                      }
                      placeholder="e.g. corp.example.com"
                    />
                  </FieldContent>
                </Field>
              ) : (
                <Field>
                  <FieldLabel>Resource Names</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      value={denyPattern.resourceNames || ""}
                      onChange={(e) =>
                        setDenyPattern({ ...denyPattern, resourceNames: e.target.value })
                      }
                      placeholder="e.g. *"
                    />
                  </FieldContent>
                </Field>
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t">
          <Button variant="neutral" onClick={handleSave}>
            Save
          </Button>
          <Button variant="outline" className="mr-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
