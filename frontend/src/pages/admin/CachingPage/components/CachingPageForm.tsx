import { useEffect, useId, useState } from "react";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useInvalidateCache } from "@app/hooks/api";
import { useGetInvalidatingCacheStatus } from "@app/hooks/api/admin/queries";
import { CacheType } from "@app/hooks/api/admin/types";

export const CachingPageForm = () => {
  const { mutateAsync: invalidateCache } = useInvalidateCache();
  const { user } = useUser();

  const [type, setType] = useState<CacheType | null>(null);
  const [shouldPoll, setShouldPoll] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const confirmationInputId = useId();

  const {
    data: invalidationStatus,
    isFetching,
    refetch
  } = useGetInvalidatingCacheStatus(shouldPoll);
  const isInvalidating = Boolean(
    isSubmitting || (shouldPoll && (isFetching || invalidationStatus))
  );

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "invalidateCache"
  ] as const);

  const handleInvalidateCacheSubmit = async () => {
    if (!type || isInvalidating) return;

    setIsSubmitting(true);
    try {
      await invalidateCache({ type });
      createNotification({
        text: `Began invalidating ${type} cache`,
        type: "success"
      });
      setShouldPoll(true);
      setConfirmation("");
      handlePopUpClose("invalidateCache");
    } catch {
      // MutationCache reports request errors globally; keep the dialog and confirmation available.
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isInvalidating) return;

    if (shouldPoll) {
      setShouldPoll(false);
      createNotification({
        text: "Successfully invalidated cache",
        type: "success"
      });
    }
  }, [isInvalidating, shouldPoll]);

  useEffect(() => {
    refetch().then((v) => setShouldPoll(v.data || false));
  }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Secrets Cache
            {isInvalidating && (
              <Badge variant="danger">
                <RefreshCwIcon className="animate-spin" />
                Invalidating cache
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="max-w-xl">
            The encrypted secrets cache encompasses all secrets stored within the system and
            provides a temporary, secure storage location for frequently accessed credentials.
          </CardDescription>
          <CardAction>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmation("");
                setType(CacheType.SECRETS);
                handlePopUpOpen("invalidateCache");
              }}
              isDisabled={!user.superAdmin || isInvalidating}
            >
              Invalidate secrets cache
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
      <AlertDialog
        open={popUp.invalidateCache.isOpen}
        onOpenChange={(isOpen) => {
          if (isSubmitting && !isOpen) return;
          handlePopUpToggle("invalidateCache", isOpen);
          if (!isOpen) setConfirmation("");
        }}
      >
        <AlertDialogContent>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              void handleInvalidateCacheSubmit();
            }}
          >
            <AlertDialogHeader className="text-left">
              <AlertDialogTitle>Invalidate {type} cache?</AlertDialogTitle>
              <AlertDialogDescription>
                This action is permanent and may take several minutes to complete.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor={confirmationInputId}>Type confirm to continue</FieldLabel>
              <Input
                id={confirmationInputId}
                name={confirmationInputId}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
              />
            </Field>
            <Alert variant="danger" className="items-center [&>svg]:translate-y-0">
              <TriangleAlertIcon />
              <AlertDescription className="text-current">This cannot be undone.</AlertDescription>
            </Alert>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={isSubmitting}>Cancel</AlertDialogCancel>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                isPending={isSubmitting}
                isDisabled={confirmation !== "confirm" || isInvalidating}
              >
                Invalidate cache
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
