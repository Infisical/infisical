import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { Spinner } from "@app/components/v4/ui/spinner";
import { CacheType } from "@app/hooks/api/admin/types";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";

export const CachingPage = () => {
  const admin = useV4Adapter("admin");
  const invalidateCache = admin.useInvalidateCache();
  const { user } = useV4Session();
  const [type, setType] = useState<CacheType | null>(null);
  const [open, setOpen] = useState(false);
  const [shouldPoll, setShouldPoll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: status, isFetching, refetch } = admin.useCacheInvalidationStatus(shouldPoll);
  const invalidating = submitting || (shouldPoll && (isFetching || Boolean(status)));

  useEffect(() => {
    if (invalidating || !shouldPoll) return;
    setShouldPoll(false);
    saved("Successfully invalidated cache");
  }, [invalidating, shouldPoll]);

  useEffect(() => {
    refetch()
      .then((result) => setShouldPoll(result.data || false))
      .catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!type || invalidating) return;
    setSubmitting(true);
    try {
      await invalidateCache.mutateAsync({ type });
      saved(`Began invalidating ${type} cache`);
      setShouldPoll(true);
      setOpen(false);
    } catch {
      // The global mutation error handler reports the failure; the dialog stays open to retry.
    } finally {
      setSubmitting(false);
    }
  };

  let disabledReason: string | undefined;
  if (!user.superAdmin) disabledReason = "Only server admins can invalidate the cache";
  else if (invalidating) disabledReason = "The cache is being invalidated";

  return (
    <Stack gap={24}>
      <PageHeader title="Caching" />
      <SettingsCard
        tone="danger"
        title="Secrets cache"
        description="Encrypted, temporary storage for all secrets in the system, used for frequently accessed credentials."
        hint={
          invalidating ? (
            <>
              <Spinner />
              Invalidating cache
            </>
          ) : undefined
        }
        actions={
          <Button
            variant="destructive"
            size="sm"
            disabledReason={disabledReason}
            onClick={() => {
              setType(CacheType.SECRETS);
              setOpen(true);
            }}
          >
            Invalidate secrets cache
          </Button>
        }
      />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent tone="danger" icon="alert" confirmText="confirm" pending={submitting}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Invalidate ${type} cache?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent and may take several minutes to complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              asChild
              disabled={invalidating}
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Button variant="destructive" loading={submitting}>
                Invalidate cache
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
