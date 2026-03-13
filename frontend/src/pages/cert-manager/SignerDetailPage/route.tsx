import { createFileRoute } from '@tanstack/react-router'

import { SignerDetailPage } from './SignerDetailPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/$signerId',
)({
  component: SignerDetailPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: 'Code Signing',
        },
        {
          label: 'Signer Details',
        },
      ],
    }
  },
})
