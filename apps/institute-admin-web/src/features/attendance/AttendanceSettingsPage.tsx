import { SettingsTab } from './components/SettingsTab'

export function AttendanceSettingsPage({ accessToken }: { accessToken: string }) {
  return (
    <div className="entity-page">
      <SettingsTab accessToken={accessToken} />
    </div>
  )
}
