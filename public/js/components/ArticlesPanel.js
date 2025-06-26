// ArticlesPanel.js
function ArticlesPanel({ articles, selectedArticle, onSelectArticle, isLoading }) {
    return React.createElement('div', { 
        className: "bg-gray-800/50 h-full flex flex-col p-4 border-l border-r border-gray-700" 
    },
        React.createElement('h2', { className: "text-xl font-bold mb-4" }, "Articles"),
        isLoading ? 
            React.createElement('div', { className: "flex items-center justify-center h-full" },
                React.createElement('i', { className: "fas fa-spinner fa-spin text-3xl text-gray-400" })
            ) : 
            React.createElement('ul', { className: "flex-grow overflow-y-auto" },
                articles.length > 0 ? articles.map(article => 
                    React.createElement('li', { 
                        key: article.id,
                        className: `block p-3 rounded-md cursor-pointer mb-2 border-l-4 ${selectedArticle?.id === article.id ? 'bg-gray-700 border-blue-500' : 'border-transparent hover:bg-gray-700/50'}`,
                        onClick: () => onSelectArticle(article)
                    },
                        React.createElement('div', { className: "flex justify-between items-start" },
                            React.createElement('span', { 
                                className: `font-medium ${article.isRead ? 'text-gray-500' : 'text-gray-200'}` 
                            }, article.title),
                            React.createElement('div', { className: "flex-shrink-0 ml-2" },
                                React.createElement(window.ArticleStatusIcon, { status: article.status })
                            )
                        ),
                        React.createElement('span', { className: "text-xs text-gray-400 mt-1" },
                            new Date(article.pubDate).toLocaleString()
                        )
                    )
                ) : 
                React.createElement('div', { className: "text-center text-gray-500 mt-10" }, 
                    "Select a feed to see articles."
                )
            )
    );
}

window.ArticlesPanel = ArticlesPanel;