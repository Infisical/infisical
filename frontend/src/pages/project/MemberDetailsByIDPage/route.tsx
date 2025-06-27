import { createFileRoute } from '@tanstack/react-router'

import { MemberDetailsByIDPage } from './MemberDetailsByIDPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/_project-general-layout/members/$membershipId',
)({
  component: MemberDetailsByIDPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [],
    }
  },
})
