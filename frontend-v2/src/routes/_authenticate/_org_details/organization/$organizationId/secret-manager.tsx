import { createFileRoute } from '@tanstack/react-router'

function SecretManagerOverviewPage() {
  return <div>Hello "/organization/secret-manager"!</div>
}

export const Route = createFileRoute(
  '/_authenticate/_org_details/_org-layout/organization/$organizationId/secret-manager',
)({
  component: SecretManagerOverviewPage,
})
