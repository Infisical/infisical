import { faHome } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { createFileRoute, linkOptions } from '@tanstack/react-router'

import { KmsOverviewPage } from './KmsOverviewPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/organization/_layout/kms/overview',
)({
  component: KmsOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: 'Products',
        icon: () => <FontAwesomeIcon icon={faHome} />,
      },
      {
        label: 'KMS',
        link: linkOptions({ to: '/organization/kms/overview' }),
      },
    ],
  }),
})
