import { Navigate, useParams, useSearch } from "@tanstack/react-router";

import { v4Path } from "../../links";

const POLICIES_ROUTE = v4Path("/organizations/$orgId/cert-manager/policies");

const TAB_DESTINATIONS = {
  profiles: v4Path("/organizations/$orgId/cert-manager/certificate-profiles"),
  policies: v4Path("/organizations/$orgId/cert-manager/certificate-policies"),
  "certificate-requests": v4Path("/organizations/$orgId/cert-manager/requests")
} as const;

export const LegacyPoliciesRedirect = () => {
  const { orgId } = useParams({ from: POLICIES_ROUTE });
  const { selectedTab, ...filters } = useSearch({ from: POLICIES_ROUTE });
  const destination = TAB_DESTINATIONS[selectedTab as keyof typeof TAB_DESTINATIONS];
  if (destination) return <Navigate replace to={destination} params={{ orgId }} />;
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/cert-manager/inventory")}
      params={{ orgId }}
      search={filters}
    />
  );
};

const ToCertManagerPage = ({
  page
}: {
  page: "applications" | "certificate-policies" | "inventory";
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  return (
    <Navigate
      replace
      to={v4Path(`/organizations/$orgId/cert-manager/${page}`)}
      params={{ orgId }}
    />
  );
};

export const LegacyCertificateTemplatesRedirect = () => (
  <ToCertManagerPage page="certificate-policies" />
);

export const LegacySubscribersRedirect = () => <ToCertManagerPage page="applications" />;

export const LegacyPkiCollectionRedirect = () => <ToCertManagerPage page="inventory" />;
