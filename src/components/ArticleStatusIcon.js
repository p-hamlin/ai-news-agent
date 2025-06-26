// ArticleStatusIcon.js
function ArticleStatusIcon({ status }) {
    switch (status) {
        case 'new':
            return <i className="fas fa-magic-wand-sparkles text-xs text-blue-400" title="Ready to summarize"></i>;
        case 'summarizing':
            return <i className="fas fa-spinner fa-spin text-xs text-gray-400" title="Summarizing..."></i>;
        case 'failed':
            return <i className="fas fa-exclamation-triangle text-xs text-red-400" title="Summarization failed"></i>;
        default:
            return null;
    }
}

window.ArticleStatusIcon = ArticleStatusIcon;