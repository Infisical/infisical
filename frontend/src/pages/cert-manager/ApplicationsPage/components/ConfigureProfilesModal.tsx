import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterableSelect
} from "@app/components/v3";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  TPkiApplication,
  useAttachPkiApplicationProfiles,
  useDetachPkiApplicationProfile,
  useListPkiApplicationProfiles
} from "@app/hooks/api/pkiApplications";

type Option = { value: string; label: string };

type Props = {
  application: TPkiApplication | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ConfigureProfilesModal = ({ application, isOpen, onOpenChange }: Props) => {
  const { projectId, orgId } = useParams({ strict: false });
  const { data: profilesData, isPending: profilesLoading } = useListCertificateProfiles({
    limit: 100
  });
  const { data: attachedProfiles } = useListPkiApplicationProfiles(application?.id ?? "");

  const attachProfiles = useAttachPkiApplicationProfiles();
  const detachProfile = useDetachPkiApplicationProfile();

  const profileOptions = useMemo<Option[]>(
    () =>
      (profilesData?.certificateProfiles ?? []).map((p) => ({
        value: p.id,
        label: p.slug
      })),
    [profilesData]
  );

  const initialOptions = useMemo<Option[]>(
    () => (attachedProfiles ?? []).map((p) => ({ value: p.profileId, label: p.profileSlug })),
    [attachedProfiles]
  );

  const [selected, setSelected] = useState<Option[]>(initialOptions);

  useEffect(() => {
    if (isOpen) setSelected(initialOptions);
  }, [isOpen, initialOptions]);

  const handleSave = async () => {
    if (!application) return;
    const nextIds = new Set(selected.map((o) => o.value));
    const currentIds = new Set(initialOptions.map((o) => o.value));
    const toAttach = [...nextIds].filter((id) => !currentIds.has(id));
    const toDetach = [...currentIds].filter((id) => !nextIds.has(id));

    if (toAttach.length === 0 && toDetach.length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      if (toAttach.length > 0) {
        await attachProfiles.mutateAsync({ applicationId: application.id, profileIds: toAttach });
      }
      await Promise.all(
        toDetach.map((profileId) =>
          detachProfile.mutateAsync({ applicationId: application.id, profileId })
        )
      );
      createNotification({ type: "success", text: "Profiles updated" });
      onOpenChange(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to update profiles.";
      createNotification({ type: "error", text: detail });
    }
  };

  const isPending = attachProfiles.isPending || detachProfile.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle>Configure Profiles</DialogTitle>
          <DialogDescription>
            Select the certificate profiles attached to {application?.name ?? "this Application"}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <FilterableSelect
            isMulti
            value={selected}
            onChange={(val) => setSelected((val ?? []) as Option[])}
            options={profileOptions}
            placeholder="Select profiles..."
          />
          {!profilesLoading && !profileOptions.length && (
            <p className="mt-3 text-xs text-yellow-500">
              No certificate profiles available.{" "}
              <Link
                to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles"
                params={{ orgId: orgId ?? "", projectId: projectId ?? "" }}
                className="underline hover:text-yellow-400"
              >
                Create one in Certificate Profiles
              </Link>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="project" onClick={handleSave} isPending={isPending}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
