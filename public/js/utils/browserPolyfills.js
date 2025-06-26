// browserPolyfills.js - Browser environment compatibility fixes
(function() {
    'use strict';
    
    // Add basic environment detection
    window.browserEnv = {
        isDevelopment: window.location.hostname === 'localhost' || 
                      window.location.search.includes('debug=true'),
        isElectron: typeof window.electronAPI !== 'undefined' || typeof window.require !== 'undefined',
        hasPerformanceAPI: typeof performance !== 'undefined' && typeof performance.now === 'function',
        hasMemoryAPI: typeof performance !== 'undefined' && typeof performance.memory !== 'undefined',
        hasIntersectionObserver: typeof IntersectionObserver !== 'undefined',
        hasPerformanceObserver: typeof PerformanceObserver !== 'undefined'
    };
    
    // Polyfill process.env for browser compatibility
    if (typeof process === 'undefined') {
        window.process = {
            env: {
                NODE_ENV: window.browserEnv.isDevelopment ? 'development' : 'production'
            }
        };
    }
    
    // Basic performance polyfill if not available
    if (!window.browserEnv.hasPerformanceAPI) {
        window.performance = {
            now: function() {
                return Date.now();
            },
            mark: function() {},
            measure: function() {}
        };
    }
    
    // Basic intersection observer polyfill placeholder
    if (!window.browserEnv.hasIntersectionObserver) {
        window.IntersectionObserver = class {
            constructor(callback) {
                this.callback = callback;
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
    
    // Basic performance observer polyfill placeholder
    if (!window.browserEnv.hasPerformanceObserver) {
        window.PerformanceObserver = class {
            constructor(callback) {
                this.callback = callback;
            }
            observe() {}
            disconnect() {}
        };
    }
    
    // Console polyfills for error handling
    if (!window.console) {
        window.console = {
            log: function() {},
            warn: function() {},
            error: function() {},
            info: function() {},
            debug: function() {}
        };
    }
    
    // RequestAnimationFrame polyfill
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function(callback) {
            return setTimeout(callback, 16);
        };
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
    }
    
    // AbortSignal.timeout polyfill for older browsers
    if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
        AbortSignal.timeout = function(ms) {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), ms);
            return controller.signal;
        };
    }
    
    console.log('Browser polyfills loaded:', window.browserEnv);
})();