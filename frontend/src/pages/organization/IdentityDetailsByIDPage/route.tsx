import { faHome } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { createFileRoute, linkOptions } from '@tanstack/react-router'

import { IdentityDetailsByIDPage } from './IdentityDetailsByIDPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/organization/_layout/identities/$identityId',
)({
  component: IdentityDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: 'Home',
        icon: () => <FontAwesomeIcon icon={faHome} />,
        link: linkOptions({ to: '/organization/secret-manager/overview' }),
      },
      {
        label: 'Access Control',
        link: linkOptions({ to: '/organization/access-management' }),
      },
      {
        label: 'identities',
      },
    ],
  }),
})
