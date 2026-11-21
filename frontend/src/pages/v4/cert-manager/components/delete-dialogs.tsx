import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";

import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";
import type { TCertificateProfile } from "@app/hooks/api/certificateProfiles/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

export const DeletePolicyDialog = ({
  policy,
  onClose,
  onDeleted
}: {
  policy?: TCertificatePolicy;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("pkiPolicies").useDeletePolicy();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(policy)} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText={policy?.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${policy?.name ?? "certificate policy"}?`}</AlertDialogTitle>
          <AlertDialogDescription>You can&apos;t undo this.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!policy) return;
              setPending(true);
              try {
                await remove.mutateAsync({ policyId: policy.id });
              } catch (error) {
                failed(`Couldn't delete ${policy.name}`, error);
                return;
              } finally {
                setPending(false);
              }
              saved(`Certificate policy ${policy.name} deleted`);
              onClose();
              onDeleted?.();
            }}
          >
            Delete policy
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const DeleteProfileDialog = ({
  profile,
  onClose,
  onDeleted
}: {
  profile?: TCertificateProfile;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("pkiPolicies").useDeleteProfile();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(profile)} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText={profile?.slug} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${profile?.slug ?? "certificate profile"}?`}</AlertDialogTitle>
          <AlertDialogDescription>You can&apos;t undo this.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!profile) return;
              setPending(true);
              try {
                await remove.mutateAsync({ profileId: profile.id });
              } catch (error) {
                failed(`Couldn't delete ${profile.slug}`, error);
                return;
              } finally {
                setPending(false);
              }
              saved(`Certificate profile ${profile.slug} deleted`);
              onClose();
              onDeleted?.();
            }}
          >
            Delete profile
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
