// ArticleStatusIcon.js - Enhanced with performance optimization for scrolling
function ArticleStatusIcon({ status, simplified = false }) {
    // Use simpler icons during scrolling for better performance
    if (simplified) {
        switch (status) {
            case 'new':
                return React.createElement('span', { 
                    className: "w-2 h-2 bg-blue-400 rounded-full inline-block",
                    title: "Ready to summarize" 
                });
            case 'summarizing':
                return React.createElement('span', { 
                    className: "w-2 h-2 bg-gray-400 rounded-full inline-block animate-pulse",
                    title: "Summarizing..." 
                });
            case 'failed':
                return React.createElement('span', { 
                    className: "w-2 h-2 bg-red-400 rounded-full inline-block",
                    title: "Summarization failed" 
                });
            default:
                return null;
        }
    }
    
    // Full icons for normal rendering
    switch (status) {
        case 'new':
            return React.createElement('i', { 
                className: "fas fa-magic-wand-sparkles text-xs text-blue-400", 
                title: "Ready to summarize" 
            });
        case 'summarizing':
            return React.createElement('i', { 
                className: "fas fa-spinner fa-spin text-xs text-gray-400", 
                title: "Summarizing..." 
            });
        case 'failed':
            return React.createElement('i', { 
                className: "fas fa-exclamation-triangle text-xs text-red-400", 
                title: "Summarization failed" 
            });
        default:
            return null;
    }
}

window.ArticleStatusIcon = ArticleStatusIcon;