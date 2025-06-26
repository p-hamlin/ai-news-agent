// useAppState.js - Custom hook for application state management
function useAppState() {
    const { useReducer } = React;

    const initialState = {
        feeds: [],
        folders: [],
        articles: [],
        selectedFeed: null,
        selectedArticle: null,
        isSettingsVisible: false,
        isLoadingArticles: false,
        expandedFolders: new Set(),
        draggedItem: null,
        dragOverItem: null,
    };

    function reducer(state, action) {
        switch (action.type) {
            case 'SET_FEEDS':
                return { ...state, feeds: action.payload };
            case 'SET_FOLDERS':
                return { ...state, folders: action.payload };
            case 'ADD_FEED':
                return { ...state, feeds: [...state.feeds, action.payload].sort((a, b) => a.name.localeCompare(b.name)) };
            case 'ADD_FOLDER':
                return { ...state, folders: [...state.folders, action.payload].sort((a, b) => a.name.localeCompare(b.name)) };
            case 'DELETE_FEED':
                const newFeeds = state.feeds.filter(f => f.id !== action.payload);
                const newSelectedFeed = state.selectedFeed?.id === action.payload ? null : state.selectedFeed;
                return { ...state, feeds: newFeeds, selectedFeed: newSelectedFeed, articles: newSelectedFeed ? state.articles : [], selectedArticle: newSelectedFeed ? state.selectedArticle : null };
            case 'DELETE_FOLDER':
                return { ...state, folders: state.folders.filter(f => f.id !== action.payload) };
            case 'UPDATE_FEED_DISPLAY_NAME':
                return {
                    ...state,
                    feeds: state.feeds.map(f => f.id === action.payload.feedId ? { ...f, name: action.payload.displayName } : f),
                    selectedFeed: state.selectedFeed?.id === action.payload.feedId ? { ...state.selectedFeed, name: action.payload.displayName } : state.selectedFeed,
                };
            case 'MOVE_FEED_TO_FOLDER':
                return {
                    ...state,
                    feeds: state.feeds.map(f => f.id === action.payload.feedId ? { ...f, folderId: action.payload.folderId } : f),
                };
            case 'TOGGLE_FOLDER':
                const newExpandedFolders = new Set(state.expandedFolders);
                if (newExpandedFolders.has(action.payload)) {
                    newExpandedFolders.delete(action.payload);
                } else {
                    newExpandedFolders.add(action.payload);
                }
                return { ...state, expandedFolders: newExpandedFolders };
            case 'SET_DRAGGED_ITEM':
                return { ...state, draggedItem: action.payload };
            case 'SET_DRAG_OVER_ITEM':
                return { ...state, dragOverItem: action.payload };
            case 'SELECT_FEED':
                if (state.selectedFeed?.id === action.payload.id) return state;
                return { ...state, selectedFeed: action.payload, selectedArticle: null, articles: [], isLoadingArticles: true };
            case 'SET_ARTICLES':
                return { ...state, articles: action.payload, isLoadingArticles: false };
            case 'SELECT_ARTICLE':
                return { ...state, selectedArticle: action.payload, articles: state.articles.map(a => a.id === action.payload.id ? { ...a, isRead: 1 } : a) };
            case 'UPDATE_ARTICLE_STATUS':
                const { articleId, status, summary } = action.payload;
                return {
                    ...state,
                    articles: state.articles.map(a => 
                        a.id === articleId 
                        ? { ...a, status, summary: summary !== null ? summary : a.summary } 
                        : a
                    ),
                    selectedArticle: state.selectedArticle?.id === articleId 
                        ? { ...state.selectedArticle, status, summary: summary !== null ? summary : state.selectedArticle.summary }
                        : state.selectedArticle
                };
            case 'SHOW_SETTINGS':
                return { ...state, isSettingsVisible: true };
            case 'HIDE_SETTINGS':
                return { ...state, isSettingsVisible: false };
            default:
                return state;
        }
    }

    const [state, dispatch] = useReducer(reducer, initialState);
    
    return { state, dispatch };
}

window.useAppState = useAppState;