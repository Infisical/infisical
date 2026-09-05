import { useFormContext } from "react-hook-form";

import {
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

import { CREDENTIAL_LABELS, TConnectionForm, UNCHANGED_SECRET } from "./connectionSchema";
import { credentialPreview } from "./CredentialFields";

type Props = {
  isUpdate: boolean;
};

export const ReviewFields = ({ isUpdate }: Props) => {
  const { watch } = useFormContext<TConnectionForm>();
  const form = watch();

  const isBasic = form.credentialType === AgentVaultCredentialType.Basic;
  const secretLabel = isBasic ? "Password" : "Token";

  // On an edit each secret is a patch, so what matters is what will happen to the stored one. An
  // emptied box clears that half of a basic credential; a bearer token has no removed state and stays.
  // Neither half is ever returned, so "Cleared" is the most an emptied box can promise.
  const outcome = (value: string | undefined, canClear: boolean) => {
    if (!isUpdate) return value ? "Set" : "None";
    if (value === UNCHANGED_SECRET) return "Unchanged";
    if (value) return "Replaced";
    return canClear ? "Cleared" : "Unchanged";
  };

  return (
    <div className="mb-4 flex flex-col gap-y-8">
      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Details</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{form.name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Hosts</DetailLabel>
            <DetailValue className="font-mono">{form.hostPattern}</DetailValue>
          </Detail>
        </div>
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Credential</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Type</DetailLabel>
            <DetailValue>{CREDENTIAL_LABELS[form.credentialType]}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Sends</DetailLabel>
            <DetailValue className="font-mono">{credentialPreview(form)}</DetailValue>
          </Detail>
          {isBasic && (
            <Detail>
              <DetailLabel>Username</DetailLabel>
              <DetailValue>{outcome(form.username, true)}</DetailValue>
            </Detail>
          )}
          {form.credentialType !== AgentVaultCredentialType.Passthrough && (
            <Detail>
              <DetailLabel>{secretLabel}</DetailLabel>
              <DetailValue>{outcome(form.secret, isBasic)}</DetailValue>
            </Detail>
          )}
        </div>
      </DetailGroup>
    </div>
  );
};
