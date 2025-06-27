import { createFileRoute } from '@tanstack/react-router'

import { IdentityDetailsByIDPage } from './IdentityDetailsByIDPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/_project-general-layout/identities/$identityId',
)({
  component: IdentityDetailsByIDPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [],
    }
  },
})
