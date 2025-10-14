import { createFileRoute, linkOptions } from '@tanstack/react-router'

import { UserDetailsByIdPage } from './UserDetailsByIdPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceId/_namespace-layout/members/$membershipId',
)({
  component: UserDetailsByIdPage,
  beforeLoad: ({ params, context }) => ({
    breadcrumbs: [
      ...context.breadcrumbs,
      {
        label: 'Access Control',
        link: linkOptions({
          to: '/organization/namespaces/$namespaceName/access-management',
          params,
        }),
      },
      {
        label: 'Users',
      },
    ],
  }),
})
