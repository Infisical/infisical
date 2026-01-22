import { createFileRoute } from '@tanstack/react-router'

import { AccountRecoveryPage } from './AccountRecoveryPage'

export const Route = createFileRoute(
  '/_restrict-login-signup/account-recovery',
)({
  component: AccountRecoveryPage,
})
