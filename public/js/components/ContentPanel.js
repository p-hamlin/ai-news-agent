// ContentPanel.js
function ContentPanel({ article, onRetrySummarization }) {
    if (!article) {
        return React.createElement('div', { className: "h-full flex items-center justify-center p-6" },
            React.createElement('div', { className: "text-center text-gray-500" },
                React.createElement('i', { className: "fas fa-arrow-left text-3xl mb-4" }),
                React.createElement('p', null, "Select an article to view.")
            )
        );
    }

    return React.createElement('div', { className: "h-full flex flex-col p-6 overflow-y-auto" },
        React.createElement('h1', { className: "text-3xl font-bold mb-4" }, article.title),
        React.createElement('div', { className: "bg-gray-800 p-4 rounded-lg mb-4" },
            React.createElement('h3', { className: "text-lg font-semibold mb-2 text-blue-400" }, "AI Summary"),
            
            article.status === 'summarizing' && React.createElement('div', { className: "text-center p-4" },
                React.createElement('i', { className: "fas fa-spinner fa-spin mr-2" }),
                " Generating summary..."
            ),

            article.status === 'failed' && React.createElement('div', { className: "text-center p-4 bg-red-900/50 rounded-md" },
                React.createElement('p', { className: "text-red-400 mb-3" }, "Summarization failed."),
                React.createElement('button', { 
                    onClick: () => onRetrySummarization(article.id),
                    className: "bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded-md transition-colors text-sm"
                },
                    React.createElement('i', { className: "fas fa-sync-alt mr-2" }),
                    "Retry"
                )
            ),

            article.status === 'summarized' && React.createElement('div', { 
                className: "prose prose-invert max-w-none text-gray-300 leading-relaxed",
                dangerouslySetInnerHTML: { __html: marked.parse(article.summary) }
            }),

            article.status === 'new' && React.createElement('div', { className: "text-gray-400" }, 
                "This article hasn't been summarized yet."
            )
        ),
        React.createElement('div', { className: "flex-grow" }),
        React.createElement('div', { className: "flex space-x-4 mt-4" },
            React.createElement('a', { 
                href: article.link, 
                target: "_blank", 
                rel: "noopener noreferrer", 
                className: "flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            },
                React.createElement('i', { className: "fas fa-book-open mr-2" }),
                "Show Full Article"
            )
        )
    );
}

window.ContentPanel = ContentPanel;