import { useFormContext } from "react-hook-form";

import {
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v3";

import { CREDENTIAL_LABELS, TConnectionForm } from "./connectionSchema";
import { credentialPreview } from "./CredentialFields";

export const ReviewFields = () => {
  const { watch } = useFormContext<TConnectionForm>();
  const form = watch();

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
        </div>
      </DetailGroup>
    </div>
  );
};
