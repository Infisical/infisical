import { createFileRoute, linkOptions } from '@tanstack/react-router'

import { GroupDetailsByIDPage } from './GroupDetailsByIDPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-scanning/_secret-scanning-layout/groups/$groupId',
)({
  component: GroupDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: 'Access Control',
          link: linkOptions({
            to: '/secret-scanning/$projectId/access-management',
            params: {
              projectId: params.projectId,
            },
          }),
        },
        {
          label: 'Groups',
        },
      ],
    }
  },
})
