import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="sa-card mx-auto my-12 max-w-lg border-err-border p-8 text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-control border border-err-border bg-err-bg text-err-text">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">
            Something went wrong in this view
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{this.state.message}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={this.handleReset} className="sa-btn-primary">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload view
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="sa-btn-secondary"
            >
              Return to Overview
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}