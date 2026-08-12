import { Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@app/components/v3";
import { TEndpointEgressRule, useDeleteEndpointEgressRule } from "@app/hooks/api/endpoint";

type Props = {
  rule?: TEndpointEgressRule;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const DeleteEgressRuleModal = ({ rule, isOpen, onOpenChange }: Props) => {
  const deleteRule = useDeleteEndpointEgressRule();

  const onConfirm = () => {
    if (!rule) return;
    deleteRule.mutate(
      { ruleId: rule.id },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: `Rule "${rule.name}" deleted` });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete &quot;{rule?.name}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            Devices will stop enforcing this rule on their next policy sync. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={onConfirm} isPending={deleteRule.isPending}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
