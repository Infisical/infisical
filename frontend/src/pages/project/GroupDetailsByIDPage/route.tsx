import { createFileRoute } from '@tanstack/react-router'

import { GroupDetailsByIDPage } from './GroupDetailsByIDPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/_project-general-layout/groups/$groupId',
)({
  component: GroupDetailsByIDPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [],
    }
  },
})
