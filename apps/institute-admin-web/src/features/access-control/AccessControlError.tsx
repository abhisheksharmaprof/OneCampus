import { ErrorState } from '../../components/admin-ui'
import type { AdminApiError } from './access-control.api'
import { apiErrorMessage } from './access-control.utils'

export function AccessControlError({ error, onRetry }: { error: AdminApiError; onRetry?: () => void }) {
  return <ErrorState message={apiErrorMessage(error)} onRetry={onRetry} />
}
