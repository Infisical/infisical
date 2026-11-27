import { useState } from "react";
import type { ComboboxCreation } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Select } from "@infisical/cipher/ui/select";

import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";

import { useOrgId, useProjectPermission } from "../../access/permissions";
import { CreateCaSheet } from "../CertificateAuthoritiesPage/create-ca-sheet";
import { ExternalCaSheet } from "../CertificateAuthoritiesPage/external-ca-sheet";
import { useCaQuotaGate } from "../CertificateAuthoritiesPage/shared";

type CaKind = "internal" | "external";

const KindForm = ({
  formId,
  onContinue
}: {
  formId: string;
  onContinue: (kind: CaKind) => void;
}) => {
  const [kind, setKind] = useState<CaKind>("internal");
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        onContinue(kind);
      }}
    >
      <Field label="Certificate authority type">
        <Select
          aria-label="Certificate authority type"
          options={[
            { value: "internal", label: "Internal" },
            { value: "external", label: "External" }
          ]}
          value={kind}
          onChange={(next) => setKind(next as CaKind)}
        />
      </Field>
    </form>
  );
};

export const useCaCreation = (
  projectId: string,
  onCreated: (ca: TUnifiedCertificateAuthority) => void
) => {
  const orgId = useOrgId();
  const { permission } = useProjectPermission(projectId);
  const internalQuota = useCaQuotaGate("internal");
  const externalQuota = useCaQuotaGate("external");
  const [open, setOpen] = useState<CaKind>();
  const canCreate = permission.can(
    ProjectPermissionCertificateAuthorityActions.Create,
    ProjectPermissionSub.CertificateAuthorities
  );

  const creation: ComboboxCreation | undefined = canCreate
    ? {
        mode: "dialog",
        label: "Create certificate authority",
        title: "Create certificate authority",
        submitLabel: "Continue",
        renderForm: ({ formId, dismiss }) => (
          <KindForm
            formId={formId}
            onContinue={(kind) => {
              dismiss();
              (kind === "internal" ? internalQuota : externalQuota).guard(() => setOpen(kind));
            }}
          />
        )
      }
    : undefined;

  return {
    creation,
    sheets: (
      <>
        <CreateCaSheet
          orgId={orgId}
          projectId={projectId}
          open={open === "internal"}
          onOpenChange={(next) => !next && setOpen(undefined)}
          onCreated={onCreated}
        />
        {open === "external" && (
          <ExternalCaSheet
            orgId={orgId}
            projectId={projectId}
            open
            onOpenChange={(next) => !next && setOpen(undefined)}
            onCreated={onCreated}
          />
        )}
        {internalQuota.upgradeGate}
        {externalQuota.upgradeGate}
      </>
    )
  };
};
