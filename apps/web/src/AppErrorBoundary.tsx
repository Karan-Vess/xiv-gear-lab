import { Component, type ErrorInfo, type ReactNode } from 'react';
import { resetBuildWorkspaceState } from './storage';

const messageFor = (error: unknown) => error instanceof Error ? error.message : String(error);

export function FatalErrorScreen({ error }: { error: unknown }) {
  const resetWorkspace = async () => {
    try {
      await resetBuildWorkspaceState();
    } finally {
      window.location.reload();
    }
  };
  return (
    <main className="fatal-error" data-fatal-error>
      <section>
        <p className="eyebrow">XIV Gear Lab recovered the window</p>
        <h1>The interface hit an unexpected error.</h1>
        <p>The app stopped this screen from going blank. Reload first. If the error returns, reset the three local build workspaces. Saved sets and custom items are not removed.</p>
        <details>
          <summary>Technical reason</summary>
          <code>{messageFor(error)}</code>
        </details>
        <div className="fatal-error-actions">
          <button className="primary" onClick={() => window.location.reload()}>Reload</button>
          <button onClick={() => void resetWorkspace()}>Reset local workspace</button>
        </div>
      </section>
    </main>
  );
}

interface BoundaryState {
  error?: Error;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = {};

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('XIV Gear Lab renderer error', error, info.componentStack);
  }

  render() {
    return this.state.error ? <FatalErrorScreen error={this.state.error} /> : this.props.children;
  }
}
