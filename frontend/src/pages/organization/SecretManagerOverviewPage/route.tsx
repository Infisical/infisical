import { faHome } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { createFileRoute } from '@tanstack/react-router'

import { SecretManagerOverviewPage } from './SecretManagerOverviewPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/organization/_layout/secret-manager/overview',
)({
  component: SecretManagerOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: 'Products',
        icon: () => <FontAwesomeIcon icon={faHome} />,
      },
      {
        label: 'Secret Management',
      },
    ],
  }),
})
