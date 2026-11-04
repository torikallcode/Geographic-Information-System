import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Kesalahan tidak diketahui.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Kesalahan aplikasi:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-loading">
          <h1>Terjadi kesalahan pada halaman</h1>
          <p style={{ maxWidth: 460, textAlign: 'center' }}>{this.state.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Muat ulang halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
