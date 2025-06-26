// ContentPanel.js
function ContentPanel({ article, onRetrySummarization }) {
    if (!article) {
        return (
            <div className="h-full flex items-center justify-center p-6">
                 <div className="text-center text-gray-500">
                    <i className="fas fa-arrow-left text-3xl mb-4"></i>
                    <p>Select an article to view.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto">
            <h1 className="text-3xl font-bold mb-4">{article.title}</h1>
            <div className="bg-gray-800 p-4 rounded-lg mb-4">
                <h3 className="text-lg font-semibold mb-2 text-blue-400">AI Summary</h3>
                
                {article.status === 'summarizing' && (
                    <div className="text-center p-4">
                        <i className="fas fa-spinner fa-spin mr-2"></i> Generating summary...
                    </div>
                )}

                {article.status === 'failed' && (
                    <div className="text-center p-4 bg-red-900/50 rounded-md">
                        <p className="text-red-400 mb-3">Summarization failed.</p>
                        <button 
                            onClick={() => onRetrySummarization(article.id)}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded-md transition-colors text-sm"
                        >
                            <i className="fas fa-sync-alt mr-2"></i> Retry
                        </button>
                    </div>
                )}

                {article.status === 'summarized' && (
                     <div 
                        className="prose prose-invert max-w-none text-gray-300 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: marked.parse(article.summary) }}
                     />
                )}

                {article.status === 'new' && (
                    <div className="text-gray-400">This article hasn't been summarized yet.</div>
                )}
            </div>
            <div className="flex-grow"></div>
            <div className="flex space-x-4 mt-4">
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    <i className="fas fa-book-open mr-2"></i> Show Full Article
                </a>
            </div>
        </div>
    );
}

window.ContentPanel = ContentPanel;