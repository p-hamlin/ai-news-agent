// ErrorBoundary.js - React Error Boundary component
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
        
        // Log error to console for debugging
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white p-8">
                    <div className="text-center bg-red-800/50 rounded-lg p-6 shadow-2xl max-w-2xl border border-red-700">
                        <h1 className="text-3xl font-bold mb-4">
                            <i className="fas fa-exclamation-triangle mr-3 text-red-400"></i>
                            Application Error
                        </h1>
                        <p className="text-lg mb-4">Something went wrong in the application.</p>
                        <div className="bg-gray-800 p-4 rounded-md mb-4 text-left overflow-auto max-h-40">
                            <p className="text-sm text-red-300 font-mono">
                                {this.state.error && this.state.error.toString()}
                            </p>
                            {this.state.errorInfo && (
                                <pre className="text-xs text-gray-400 mt-2 whitespace-pre-wrap">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            )}
                        </div>
                        <button 
                            onClick={() => window.location.reload()}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            <i className="fas fa-refresh mr-2"></i>
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

window.ErrorBoundary = ErrorBoundary;