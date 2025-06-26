import { createFileRoute, linkOptions } from '@tanstack/react-router'

import { IdentityDetailsByIDPage } from './IdentityDetailsByIDPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/kms/_kms-layout/identities/$identityId',
)({
  component: IdentityDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: 'Access Control',
          link: linkOptions({
            to: '/kms/$projectId/access-management',
            params: {
              projectId: params.projectId,
            },
          }),
        },
        {
          label: 'Identities',
        },
      ],
    }
  },
})
