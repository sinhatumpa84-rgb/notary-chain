import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Application ErrorBoundary Caught]:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-4 text-[#2E2A26]">
          <div className="w-full max-w-md bg-white border border-[#E8E2DA] rounded-2xl p-6 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-[#2E2A26] mb-1">Something went wrong</h2>
            <p className="text-xs text-[#55504B] mb-4">
              {this.state.error?.message || 'An unexpected error occurred while rendering the page.'}
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-[#2D6A4F] text-white rounded-xl text-xs font-semibold hover:bg-[#1B4332] transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
