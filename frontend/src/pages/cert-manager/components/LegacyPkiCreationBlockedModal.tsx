import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { LEGACY_PKI_DEPRECATION_DATE, LegacyPkiResource } from "@app/const/legacyPkiDeprecation";
import { useOrganization, useProject } from "@app/context";
import { useScopeVariant } from "@app/hooks";

import { PkiDocsUrls } from "../pki-docs-urls";

type Props = {
  resource: LegacyPkiResource;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const RESOURCE_NOUN: Record<LegacyPkiResource, string> = {
  [LegacyPkiResource.CertificateTemplate]: "Certificate templates",
  [LegacyPkiResource.PkiSubscriber]: "Subscribers"
};

// Shown instead of the creation form, which is closed ahead of removal.
export const LegacyPkiCreationBlockedModal = ({ resource, isOpen, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const scopeVariant = useScopeVariant();

  const noun = RESOURCE_NOUN[resource];

  const handleNavigate = () => {
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/applications",
      params: { orgId: currentOrg.id, projectId: currentProject.id }
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Use Applications Instead</DialogTitle>
          <DialogDescription className="my-4 whitespace-pre-line text-foreground/75">
            {noun} are being removed on {LEGACY_PKI_DEPRECATION_DATE}, and new ones can no longer be
            created. Certificate applications replace them. Your existing {noun.toLowerCase()} keep
            issuing certificates until the removal date.{" "}
            <a
              href={PkiDocsUrls.applications.overview}
              target="_blank"
              rel="noreferrer"
              className="underline hover:opacity-80"
            >
              Read about certificate applications
            </a>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={scopeVariant} onClick={handleNavigate}>
            Go to Applications
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
