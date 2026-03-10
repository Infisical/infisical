import { createFileRoute, linkOptions } from '@tanstack/react-router'

import { InfraRunDetailPage } from './InfraRunDetailPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/run/$runId',
)({
  component: InfraRunDetailPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: 'Runs',
          link: linkOptions({
            to: '/organizations/$orgId/projects/infra/$projectId/runs',
            params: {
              orgId: params.orgId,
              projectId: params.projectId,
            },
          }),
        },
        { label: `Run ${params.runId.slice(0, 8)}` },
      ],
    }
  },
})
