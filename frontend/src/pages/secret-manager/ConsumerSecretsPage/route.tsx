import { createFileRoute } from '@tanstack/react-router'

import { ConsumerSecretsPage } from './ConsumerSecretsPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/organization/_layout/consumer-secrets',
)({
  component: ConsumerSecretsPage,
})
