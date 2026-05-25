import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="card p-8 max-w-md text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'rgba(239, 68, 68, 0.08)' }}>
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">页面出错了</h2>
            <p className="text-sm text-slate-400 mb-6">{this.state.error?.message || '未知错误'}</p>
            <button onClick={() => this.setState({ hasError: false, error: null })}
              className="btn btn-primary">
              <RefreshCw className="w-4 h-4" /> 重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
