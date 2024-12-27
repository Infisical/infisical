import { createFileRoute } from '@tanstack/react-router'

import { SelectOrganizationPage } from './SelectOrgPage'

export const Route = createFileRoute(
  '/_restrict-login-signup/login/select-organization',
)({
  component: SelectOrganizationPage,
})
