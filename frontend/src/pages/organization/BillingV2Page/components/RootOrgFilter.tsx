import { Building2 } from "lucide-react";

import { Combobox } from "@app/components/v3";
import { BillingV2Organization } from "@app/hooks/api";

type RootOrgFilterProps = {
  orgs: BillingV2Organization[];
  value: string;
  onChange: (orgId: string) => void;
  isLoading?: boolean;
};

// Picks which root organization's usage the breakdown explains. A self-hosted licence covers every org
// in the instance, so the billed figure spans all of them and one org's page cannot account for it on
// its own. Cloud bills per root org, so this is not rendered there.
export const RootOrgFilter = ({ orgs, value, onChange, isLoading }: RootOrgFilterProps) => (
  <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
    <div className="flex items-center gap-2">
      <Building2 className="size-4 text-org" />
      <span className="text-sm font-medium text-foreground">Organization</span>
    </div>
    <p className="text-xs text-muted">
      This instance&apos;s licence covers every organization on it. Pick one to see the usage it
      contributes.
    </p>
    {/* The width goes on a wrapper: Combobox forwards className to its input, while the chevron is
        positioned against the full-width container, so narrowing the input alone strands it. */}
    <div className="w-full max-w-sm">
      <Combobox<BillingV2Organization>
        id="billing-root-org-filter"
        placeholder="Select an organization..."
        searchPlaceholder="Search organizations..."
        searchAriaLabel="Search root organizations"
        isLoading={isLoading}
        options={orgs}
        value={orgs.find((org) => org.id === value) ?? null}
        onValueChange={(option) => onChange(option.id)}
        getOptionValue={(option) => option.id}
        getOptionLabel={(option) => option.name}
        emptyMessage="No organizations found"
      />
    </div>
  </div>
);
