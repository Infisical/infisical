import { useEffect, useState } from "react";
import { BanIcon } from "lucide-react";

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

export const RevokeHoneyTokenModal = ({ isOpen, onOpenChange, honeyToken }: Props) => {
  const revokeHoneyToken = useRevokeHoneyToken();
  const [inputData, setInputData] = useState("");

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  if (!honeyToken) return null;

  const handleRevoke = async () => {
    await revokeHoneyToken.mutateAsync({
      honeyTokenId: honeyToken.id,
      projectId: honeyToken.projectId
    });

    createNotification({
      text: `Successfully revoked honey token "${honeyToken.name}"`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl!">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <BanIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to revoke {honeyToken.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will revoke the AWS IAM credentials and remove the associated decoy secrets from
            this environment. The honey token record and its events will be preserved for audit
            purposes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputData === honeyToken.name) handleRevoke();
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
            onClick={handleRevoke}
            disabled={inputData !== honeyToken.name}
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
