import { ProjectType } from '@app/hooks/api/workspace/types'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticate/_org_details/_org-layout/organization/$organizationId/overview/',
)({
  beforeLoad: ({ context }) => {
    throw redirect({
      to: `/organization/$organizationId/${ProjectType.SecretManager}` as const,
      params: {
        organizationId: context.organizationId,
      },
    })
  },
})
