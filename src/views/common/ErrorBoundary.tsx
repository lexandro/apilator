import { Component, type ErrorInfo, type ReactNode } from 'react';
import './ErrorBoundary.css';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Names the part that failed, so a contained failure does not read as a dead app. */
  label?: string;
  /** Rendered instead of the default panel when the caller wants something smaller. */
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Without one of these a render error unmounts the whole tree and leaves an empty window
 * with nothing to go on. 0.9.0 shipped that way and an infinite render loop in Settings
 * looked, from the outside, like the app had simply vanished.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render failed:', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.retry);

    return (
      <div className="error-boundary" role="alert">
        <h2 className="error-boundary__title">{this.props.label ?? 'Something went wrong'}</h2>
        <p className="error-boundary__message">{error.message || String(error)}</p>

        <div className="error-boundary__actions">
          <button className="error-boundary__button" onClick={this.retry}>
            Try again
          </button>
          <button
            className="error-boundary__button error-boundary__button--primary"
            onClick={() => window.location.reload()}
          >
            Restart the window
          </button>
        </div>

        {error.stack && (
          <details className="error-boundary__details">
            <summary>Technical details</summary>
            <pre className="error-boundary__stack">{error.stack}</pre>
          </details>
        )}
      </div>
    );
  }
}
