import { createFileRoute } from '@tanstack/react-router'

import { ProjectsPage } from './ProjectsPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceId/_namespace-layout/projects',
)({
  component: ProjectsPage,
  beforeLoad: ({ context }) => ({
    breadcrumbs: [
      ...context.breadcrumbs,
      {
        label: 'Projects',
      },
    ],
  }),
})
