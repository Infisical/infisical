import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, EyeIcon, LockIcon, SearchIcon } from "lucide-react";

import {
  Badge,
  Button,
  Checkbox,
  CodeBlock,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { getAwsPolicyJson } from "@app/helpers/awsUseCasePolicies";
import { AWS_USE_CASE_GROUPS } from "@app/helpers/awsUseCases";

type Props = {
  isOpen: boolean;
  initialView: "list" | "policy";
  onOpenChange: (isOpen: boolean) => void;
  selected: string[];
  lockedIds: string[];
  onToggle: (id: string, isChecked: boolean) => void;
};

type PolicyView = { title: string; ids: string[]; fromList: boolean } | null;

export const AwsUseCasesSheet = ({
  isOpen,
  initialView,
  onOpenChange,
  selected,
  lockedIds,
  onToggle
}: Props) => {
  const [search, setSearch] = useState("");
  const [policyView, setPolicyView] = useState<PolicyView>(null);

  useEffect(() => {
    if (isOpen) {
      setPolicyView(
        initialView === "policy" ? { title: "Role policy", ids: selected, fromList: false } : null
      );
    }
  }, [isOpen, initialView]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return AWS_USE_CASE_GROUPS.map((group) => ({
      label: group.label,
      options: group.options.filter(({ label }) => label.toLowerCase().includes(query))
    })).filter((group) => group.options.length > 0);
  }, [search]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearch("");
      setPolicyView(null);
    }
    onOpenChange(open);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent side="right" size="form">
        {policyView ? (
          <>
            <SheetHeader>
              <SheetTitle>{policyView.title}</SheetTitle>
              <SheetDescription>
                IAM permissions granted to the role. This is a read-only preview.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
              <CodeBlock
                isFill
                label="IAM policy (JSON)"
                value={getAwsPolicyJson(policyView.ids)}
              />
            </div>
            <SheetFooter>
              {policyView.fromList ? (
                <Button type="button" variant="outline" onClick={() => setPolicyView(null)}>
                  <ArrowLeftIcon />
                  Back to use cases
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Close
                </Button>
              )}
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Role permissions</SheetTitle>
              <SheetDescription>
                Choose what Infisical can do with this role. Only the selected permissions are
                granted.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4">
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search use cases..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              {groups.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">No use cases match.</p>
              )}
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-xs font-medium text-muted">{group.label}</p>
                  <div className="space-y-1">
                    {group.options.map(({ id, label }) => {
                      const isLocked = lockedIds.includes(id);
                      const isLastSelected = selected.length === 1 && selected.includes(id);
                      return (
                        <div key={id} className="flex items-center justify-between gap-2">
                          <Label
                            className={`flex items-center gap-2 text-sm ${isLocked ? "" : "cursor-pointer"}`}
                          >
                            <Checkbox
                              variant="project"
                              isChecked={selected.includes(id)}
                              isDisabled={isLocked || isLastSelected}
                              onCheckedChange={(checked) => onToggle(id, checked === true)}
                            />
                            {label}
                            {isLocked && (
                              <Badge variant="neutral">
                                <LockIcon />
                                Required
                              </Badge>
                            )}
                          </Label>
                          <IconButton
                            type="button"
                            variant="ghost"
                            size="xs"
                            aria-label={`View ${label} policy`}
                            onClick={() =>
                              setPolicyView({ title: label, ids: [id], fromList: true })
                            }
                          >
                            <EyeIcon />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <SheetFooter className="sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                isDisabled={selected.length === 0}
                onClick={() =>
                  setPolicyView({ title: "Combined policy", ids: selected, fromList: true })
                }
              >
                <EyeIcon />
                View combined policy
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done ({selected.length})
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
