import { createFileRoute } from '@tanstack/react-router'

import { SshGroupDetailsByIDPage } from './SshGroupDetailsByIDPage'

export const Route = createFileRoute(
  '/_authenticate/_inject-org-details/_org-layout/ssh/$projectId/_ssh-layout/ssh-host-groups/$sshHostGroupId',
)({
  component: SshGroupDetailsByIDPage,
})
