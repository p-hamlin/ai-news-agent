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
            return React.createElement('div', { 
                className: "h-screen w-screen flex items-center justify-center bg-gray-900 text-white p-8" 
            }, 
                React.createElement('div', { 
                    className: "text-center bg-red-800/50 rounded-lg p-6 shadow-2xl max-w-2xl border border-red-700" 
                },
                    React.createElement('h1', { className: "text-3xl font-bold mb-4" },
                        React.createElement('i', { className: "fas fa-exclamation-triangle mr-3 text-red-400" }),
                        "Application Error"
                    ),
                    React.createElement('p', { className: "text-lg mb-4" }, "Something went wrong in the application."),
                    React.createElement('div', { className: "bg-gray-800 p-4 rounded-md mb-4 text-left overflow-auto max-h-40" },
                        React.createElement('p', { className: "text-sm text-red-300 font-mono" },
                            this.state.error && this.state.error.toString()
                        ),
                        this.state.errorInfo && React.createElement('pre', { 
                            className: "text-xs text-gray-400 mt-2 whitespace-pre-wrap" 
                        }, this.state.errorInfo.componentStack)
                    ),
                    React.createElement('button', { 
                        onClick: () => window.location.reload(),
                        className: "bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                    },
                        React.createElement('i', { className: "fas fa-refresh mr-2" }),
                        "Reload Application"
                    )
                )
            );
        }

        return this.props.children;
    }
}

window.ErrorBoundary = ErrorBoundary;