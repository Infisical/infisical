import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { failed, toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { ChangeRequest } from "./parts";

const MIN_REASON = 10;

export const MergeButtons = ({
  request,
  projectId,
  closeBlocked,
  mergeBlocked,
  bypass
}: {
  request: ChangeRequest;
  projectId: string;
  closeBlocked?: string;
  mergeBlocked?: string;
  bypass: boolean;
}) => {
  const secrets = useV4Adapter("secrets");
  const merge = secrets.useMergeApprovalRequest();
  const updateStatus = secrets.useUpdateApprovalRequestStatus();
  const [closing, setClosing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [reason, setReason] = useState("");

  const close = async () => {
    setClosing(true);
    try {
      await updateStatus.mutateAsync({ id: request.id, projectId, status: "close" });
      toast({ tone: "ok", title: "Change request closed" });
    } catch (error) {
      failed("The change request could not be closed", error);
    } finally {
      setClosing(false);
    }
  };

  const run = async (bypassReason?: string) => {
    setMerging(true);
    try {
      await merge.mutateAsync({
        id: request.id,
        projectId,
        environment: request.environment,
        secretPath: request.secretPath,
        bypassReason
      });
      setBypassOpen(false);
      setReason("");
      toast({ tone: "ok", title: "Change request merged" });
    } catch (error) {
      failed("The change request could not be merged", error);
    } finally {
      setMerging(false);
    }
  };

  return (
    <>
      <Button variant="outline" loading={closing} disabledReason={closeBlocked} onClick={close}>
        Close request
      </Button>
      <Button
        variant={mergeBlocked ? "outline" : "primary"}
        loading={merging && !bypassOpen}
        disabledReason={mergeBlocked}
        onClick={() => (bypass ? setBypassOpen(true) : run())}
      >
        {bypass ? "Merge without approval" : "Merge"}
      </Button>
      <Dialog
        open={bypassOpen}
        onOpenChange={(next) => {
          setBypassOpen(next);
          if (!next) setReason("");
        }}
      >
        <DialogContent pending={merging}>
          <DialogHeader>
            <DialogTitle>Merge without approval</DialogTitle>
            <DialogDescription>
              This bypasses the secret change policy. The reason is recorded on the request.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason for bypass" description={`At least ${MIN_REASON} characters.`}>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" disabled={merging} onClick={() => setBypassOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={merging}
              disabledReason={
                reason.trim().length < MIN_REASON
                  ? `Enter a reason of at least ${MIN_REASON} characters`
                  : undefined
              }
              onClick={() => run(reason)}
            >
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const ReopenButton = ({
  request,
  projectId
}: {
  request: ChangeRequest;
  projectId: string;
}) => {
  const updateStatus = useV4Adapter("secrets").useUpdateApprovalRequestStatus();
  const [reopening, setReopening] = useState(false);
  return (
    <Button
      variant="outline"
      loading={reopening}
      onClick={async () => {
        setReopening(true);
        try {
          await updateStatus.mutateAsync({ id: request.id, projectId, status: "open" });
          toast({ tone: "ok", title: "Change request reopened" });
        } catch (error) {
          failed("The change request could not be reopened", error);
        } finally {
          setReopening(false);
        }
      }}
    >
      Reopen request
    </Button>
  );
};
