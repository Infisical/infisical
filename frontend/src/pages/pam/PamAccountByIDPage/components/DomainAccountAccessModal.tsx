import { useEffect, useMemo, useState } from "react";
import { faCopy, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { MonitorIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";
import { PAM_RESOURCE_TYPE_MAP, useListRelatedResources } from "@app/hooks/api/pam";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  adResourceId: string;
  accountName: string;
  projectId: string;
  preselectedResourceId?: string;
};

const ResourceOptionLabel = ({ label, image }: { label: string; image?: string }) => (
  <div className="flex items-center gap-2">
    {image ? (
      <img alt={label} src={`/images/integrations/${image}`} className="size-4" />
    ) : (
      <MonitorIcon className="size-4 text-muted" />
    )}
    <span>{label}</span>
  </div>
);

export const DomainAccountAccessModal = ({
  isOpen,
  onOpenChange,
  adResourceId,
  accountName,
  projectId,
  preselectedResourceId
}: Props) => {
  const { data: relatedResources, isPending } = useListRelatedResources(adResourceId, {
    enabled: isOpen
  });

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    preselectedResourceId ?? null
  );
  const [step, setStep] = useState<"select" | "command">("select");
  const [duration, setDuration] = useState("4h");

  useEffect(() => {
    if (isOpen) {
      setSelectedResourceId(preselectedResourceId ?? null);
      setStep("select");
      setDuration("4h");
    }
  }, [isOpen, preselectedResourceId]);

  const options = useMemo(() => {
    if (!relatedResources) return [];
    return relatedResources.map((r) => {
      const typeInfo = PAM_RESOURCE_TYPE_MAP[r.resourceType];
      return {
        value: r.id,
        label: r.name,
        image: typeInfo?.image
      };
    });
  }, [relatedResources]);

  const selectedOption = options.find((o) => o.value === selectedResourceId) ?? null;
  const selectedResource = relatedResources?.find((r) => r.id === selectedResourceId);

  const command = selectedResource
    ? `infisical pam rdp access --resource ${selectedResource.name} --account ${accountName} --project-id ${projectId} --duration ${duration} --domain ${window.location.origin}`
    : "";

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(command);
    createNotification({
      text: "Command copied to clipboard",
      type: "info"
    });
  };

  if (step === "command" && selectedResource) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent
          title="Access Account"
          subTitle={`Connect as ${accountName} on ${selectedResource.name}`}
          className="max-w-2xl"
        >
          <div className="py-1">
            <p className="text-sm font-medium text-mineshaft-400">Terminal</p>
            <p className="mb-2 text-xs text-mineshaft-400">
              Connect via RDP using the Infisical CLI
            </p>
            <FormLabel
              label="Duration"
              tooltipText="The maximum duration of your session. Ex: 1h, 3w, 30d"
            />
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="4h"
            />
            <FormLabel label="CLI Command" className="mt-4" />
            <div className="flex gap-2">
              <Input value={command} isDisabled />
              <IconButton
                ariaLabel="copy"
                variant="outline_bg"
                colorSchema="secondary"
                onClick={handleCopyCommand}
                className="w-10"
              >
                <FontAwesomeIcon icon={faCopy} />
              </IconButton>
            </div>
            <a
              href="https://infisical.com/docs/cli/overview"
              target="_blank"
              className="mt-2 flex h-4 w-fit items-center gap-2 border-b border-mineshaft-400 text-sm text-mineshaft-400 transition-colors duration-100 hover:border-yellow-400 hover:text-yellow-400"
              rel="noreferrer"
            >
              <span>Install the Infisical CLI</span>
              <FontAwesomeIcon icon={faUpRightFromSquare} className="size-3" />
            </a>
          </div>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Access Account"
        subTitle="Select a resource to access this domain account on."
        bodyClassName="overflow-visible"
      >
        <div className="flex flex-col gap-4">
          <div>
            <FormLabel label="Resource" />
            <FilterableSelect
              value={selectedOption}
              onChange={(opt) =>
                setSelectedResourceId(opt ? (opt as { value: string }).value : null)
              }
              options={options}
              formatOptionLabel={ResourceOptionLabel}
              placeholder={isPending ? "Loading resources..." : "Select a resource..."}
              isLoading={isPending}
              isClearable
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setStep("command")}
              isDisabled={!selectedResource}
              className="bg-primary font-medium text-black hover:bg-primary-600"
            >
              Access
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
