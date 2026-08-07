import { Component, type ErrorInfo, type ReactNode } from 'react'

export class AdminErrorBoundary extends Component<{
  children: ReactNode
  resetKey: string
}, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    window.dispatchEvent(new CustomEvent('campusone:ui-error', { detail: { message: error.message, componentStack: info.componentStack } }))
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <section className="card dashboard-state" role="alert"><h1>We could not display this screen</h1><p>The rest of the admin panel is still available. Refresh this screen or return to the dashboard.</p><div className="page-actions"><button className="button-primary" type="button" onClick={() => this.setState({ error: null })}>Try again</button><button className="button-secondary" type="button" onClick={() => { window.location.href = '/dashboard' }}>Go to dashboard</button></div></section>
  }
}
