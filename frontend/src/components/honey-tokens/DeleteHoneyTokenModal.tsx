import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";

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
  AlertDialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useRevokeHoneyToken } from "@app/hooks/api/honeyTokens";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

type Props = {
  honeyToken?: TDashboardHoneyToken;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteHoneyTokenModal = ({ isOpen, onOpenChange, honeyToken }: Props) => {
  const revokeHoneyToken = useRevokeHoneyToken();
  const [inputData, setInputData] = useState("");

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  if (!honeyToken) return null;

  const handleDelete = async () => {
    await revokeHoneyToken.mutateAsync({
      honeyTokenId: honeyToken.id,
      projectId: honeyToken.projectId
    });

    createNotification({
      text: `Successfully deleted honey token "${honeyToken.name}"`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl!">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to delete {honeyToken.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will revoke the AWS IAM credentials and remove the associated decoy secrets from
            this environment.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputData === honeyToken.name) handleDelete();
          }}
        >
          <Field>
            <FieldLabel>
              Type <span className="font-bold">{honeyToken.name}</span> to confirm
            </FieldLabel>
            <FieldContent>
              <Input
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={`Type ${honeyToken.name} here`}
              />
            </FieldContent>
          </Field>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleDelete}
            disabled={inputData !== honeyToken.name}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
