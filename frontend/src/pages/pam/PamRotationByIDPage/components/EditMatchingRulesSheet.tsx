import { useEffect, useState } from "react";

import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";

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
  const [allowPattern, setAllowPattern] = useState<MatchingPattern>(
    policy.allowPattern || emptyPattern(policy.type)
  );

  useEffect(() => {
    if (isOpen) {
      setAllowPattern(policy.allowPattern || emptyPattern(policy.type));
    }
  }, [isOpen, policy]);

  const handleSave = () => {
    onOpenChange(false);
  };

  const isDomain = policy.type === RotationPolicyType.DomainWindows;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Edit Matching Rules"
        subTitle="Accounts matching these patterns will be rotated."
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormControl label="Account Names">
              <Input
                value={allowPattern.accountNames}
                onChange={(e) => setAllowPattern({ ...allowPattern, accountNames: e.target.value })}
                placeholder="e.g. app_*, postgres"
              />
            </FormControl>
            {isDomain ? (
              <FormControl label="Domain Name">
                <Input
                  value={allowPattern.domainName || ""}
                  onChange={(e) => setAllowPattern({ ...allowPattern, domainName: e.target.value })}
                  placeholder="e.g. corp.example.com"
                />
              </FormControl>
            ) : (
              <FormControl label="Resource Names">
                <Input
                  value={allowPattern.resourceNames || ""}
                  onChange={(e) =>
                    setAllowPattern({ ...allowPattern, resourceNames: e.target.value })
                  }
                  placeholder="e.g. prod-*, *"
                />
              </FormControl>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              className="bg-primary font-medium text-black hover:bg-primary-600"
            >
              Save
            </Button>
            <Button onClick={() => onOpenChange(false)} colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
