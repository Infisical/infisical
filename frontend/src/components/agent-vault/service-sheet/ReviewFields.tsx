import { useFormContext } from "react-hook-form";

import {
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

import { credentialPreview } from "./CredentialFields";
import {
  CREDENTIAL_LABELS,
  isAllMethods,
  SURFACE_LABELS,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";

const NONE = <span className="text-muted italic">None</span>;

type Props = {
  isUpdate: boolean;
};

export const ReviewFields = ({ isUpdate }: Props) => {
  const { watch } = useFormContext<TServiceForm>();
  const form = watch();

  const isBasic = form.credentialType === AgentVaultCredentialType.Basic;
  const secretLabel = isBasic ? "Password" : "Token";
  const sends = credentialPreview(form);

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
            <DetailValue>{form.hosts.join(", ")}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Methods</DetailLabel>
            <DetailValue>
              {isAllMethods(form.methods) ? "All" : form.methods.join(", ")}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Paths</DetailLabel>
            <DetailValue>
              {form.pathPrefixes.length ? form.pathPrefixes.join(", ") : "All"}
            </DetailValue>
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
          {sends && (
            <Detail>
              <DetailLabel>Sends</DetailLabel>
              <DetailValue>{sends}</DetailValue>
            </Detail>
          )}
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

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">
          Transformations
        </DetailGroupHeader>
        {/* One line each, so a header reads the way it goes out on the wire. */}
        <div className="flex flex-col gap-1.5 text-sm text-foreground">
          {form.customHeaders.length === 0 && form.substitutions.length === 0 && <p>{NONE}</p>}
          {form.customHeaders
            .filter((header) => header.name)
            .map((header) => (
              <p key={header.name}>
                {header.name}: {header.prefix ? `${header.prefix} ` : ""}••••••••
              </p>
            ))}
          {form.substitutions
            .filter((substitution) => substitution.placeholder)
            .map((substitution) => (
              <p key={substitution.placeholder}>
                {substitution.placeholder} → ••••••••
                {substitution.surfaces.length
                  ? ` in ${substitution.surfaces
                      .map((surface) => SURFACE_LABELS[surface].toLowerCase())
                      .join(", ")}`
                  : ""}
              </p>
            ))}
        </div>
      </DetailGroup>
    </div>
  );
};
