// performanceMonitor.js - Comprehensive UI performance monitoring service
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            // Rendering performance
            renderTimes: [],
            avgRenderTime: 0,
            slowRenders: 0, // renders > 16ms
            
            // Memory usage
            memorySnapshots: [],
            avgMemoryUsage: 0,
            memoryLeaks: [],
            
            // User interactions
            interactionTimes: [],
            avgInteractionTime: 0,
            slowInteractions: 0, // interactions > 100ms
            
            // Network/API performance
            apiCalls: [],
            avgApiTime: 0,
            failedApiCalls: 0,
            
            // Virtualization metrics
            virtualizationStats: {
                itemsRendered: 0,
                itemsVisible: 0,
                scrollEvents: 0,
                averageScrollFPS: 0
            },
            
            // Overall app health
            startTime: Date.now(),
            errorCount: 0,
            warningCount: 0
        };
        
        this.observers = [];
        this.isMonitoring = false;
        this.reportInterval = null;
        this.maxMetricsHistory = 1000; // Limit memory usage
        
        // Performance thresholds
        this.thresholds = {
            renderTime: 16, // 60fps target
            interactionTime: 100,
            memoryGrowth: 50 * 1024 * 1024, // 50MB
            apiTimeout: 5000
        };
        
        this.initializeMonitoring();
    }
    
    initializeMonitoring() {
        if (typeof window === 'undefined') return;
        
        // Monitor Long Tasks (requires browser support)
        if ('PerformanceObserver' in window) {
            try {
                // Long task observer
                const longTaskObserver = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        this.recordSlowTask(entry.duration, entry.name);
                    });
                });
                longTaskObserver.observe({ entryTypes: ['longtask'] });
                this.observers.push(longTaskObserver);
                
                // Layout shift observer
                const layoutShiftObserver = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        if (entry.value > 0.1) { // Significant layout shift
                            this.recordLayoutShift(entry.value);
                        }
                    });
                });
                layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
                this.observers.push(layoutShiftObserver);
                
                // Navigation observer
                const navigationObserver = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        this.recordNavigation(entry);
                    });
                });
                navigationObserver.observe({ entryTypes: ['navigation'] });
                this.observers.push(navigationObserver);
                
            } catch (error) {
                console.warn('Some performance observers not supported:', error);
            }
        }
        
        // Memory monitoring
        this.startMemoryMonitoring();
        
        // Frame rate monitoring
        this.startFrameRateMonitoring();
        
        // Error monitoring
        this.setupErrorTracking();
        
        this.isMonitoring = true;
    }
    
    startMemoryMonitoring() {
        if (!performance.memory) {
            console.warn('Performance.memory not available - memory monitoring disabled');
            return;
        }
        
        const checkMemory = () => {
            const memory = performance.memory;
            const snapshot = {
                timestamp: Date.now(),
                usedJSHeapSize: memory.usedJSHeapSize,
                totalJSHeapSize: memory.totalJSHeapSize,
                jsHeapSizeLimit: memory.jsHeapSizeLimit
            };
            
            this.metrics.memorySnapshots.push(snapshot);
            
            // Keep only recent snapshots
            if (this.metrics.memorySnapshots.length > 100) {
                this.metrics.memorySnapshots.shift();
            }
            
            // Calculate average
            const recent = this.metrics.memorySnapshots.slice(-10);
            this.metrics.avgMemoryUsage = recent.reduce((sum, snap) => 
                sum + snap.usedJSHeapSize, 0) / recent.length;
            
            // Detect potential memory leaks
            if (this.metrics.memorySnapshots.length >= 10) {
                const growth = snapshot.usedJSHeapSize - this.metrics.memorySnapshots[0].usedJSHeapSize;
                if (growth > this.thresholds.memoryGrowth) {
                    this.metrics.memoryLeaks.push({
                        timestamp: Date.now(),
                        growth: growth,
                        duration: snapshot.timestamp - this.metrics.memorySnapshots[0].timestamp
                    });
                }
            }
        };
        
        // Check memory every 60 seconds in production, 30 seconds in development
        const interval = window.browserEnv && window.browserEnv.isDevelopment ? 30000 : 60000;
        setInterval(checkMemory, interval);
        checkMemory(); // Initial check
    }
    
    startFrameRateMonitoring() {
        let frameCount = 0;
        let lastTime = performance.now();
        let fps = 0;
        
        const countFrames = (currentTime) => {
            frameCount++;
            
            if (currentTime - lastTime >= 1000) { // Every second
                fps = frameCount;
                frameCount = 0;
                lastTime = currentTime;
                
                // Record FPS for scroll performance
                if (this.isScrolling) {
                    this.metrics.virtualizationStats.averageScrollFPS = 
                        (this.metrics.virtualizationStats.averageScrollFPS + fps) / 2;
                }
            }
            
            requestAnimationFrame(countFrames);
        };
        
        requestAnimationFrame(countFrames);
    }
    
    setupErrorTracking() {
        // Track JavaScript errors
        window.addEventListener('error', (event) => {
            this.recordError('JavaScript Error', event.error, event.filename, event.lineno);
        });
        
        // Track unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.recordError('Unhandled Promise Rejection', event.reason);
        });
        
        // Note: Removed console.error override to prevent infinite recursion
        // React errors will be caught by the error boundary instead
    }
    
    // Public API methods
    
    startRenderMeasurement(componentName = 'unknown') {
        return {
            componentName,
            startTime: performance.now(),
            startMemory: (performance.memory && performance.memory.usedJSHeapSize) || 0
        };
    }
    
    endRenderMeasurement(measurement) {
        const endTime = performance.now();
        const renderTime = endTime - measurement.startTime;
        const endMemory = (performance.memory && performance.memory.usedJSHeapSize) || 0;
        const memoryDelta = endMemory - measurement.startMemory;
        
        this.metrics.renderTimes.push({
            componentName: measurement.componentName,
            duration: renderTime,
            timestamp: endTime,
            memoryDelta
        });
        
        // Keep history manageable
        if (this.metrics.renderTimes.length > this.maxMetricsHistory) {
            this.metrics.renderTimes.shift();
        }
        
        // Update averages
        this.updateRenderStats();
        
        // Log slow renders
        if (renderTime > this.thresholds.renderTime) {
            this.metrics.slowRenders++;
            console.warn(`Slow render detected: ${measurement.componentName} took ${renderTime.toFixed(2)}ms`);
        }
        
        return renderTime;
    }
    
    recordInteraction(type, duration, details = {}) {
        const interaction = {
            type,
            duration,
            timestamp: Date.now(),
            details
        };
        
        this.metrics.interactionTimes.push(interaction);
        
        // Keep history manageable
        if (this.metrics.interactionTimes.length > this.maxMetricsHistory) {
            this.metrics.interactionTimes.shift();
        }
        
        this.updateInteractionStats();
        
        if (duration > this.thresholds.interactionTime) {
            this.metrics.slowInteractions++;
            console.warn(`Slow interaction: ${type} took ${duration.toFixed(2)}ms`);
        }
    }
    
    recordApiCall(endpoint, duration, success = true, details = {}) {
        const apiCall = {
            endpoint,
            duration,
            success,
            timestamp: Date.now(),
            details
        };
        
        this.metrics.apiCalls.push(apiCall);
        
        if (!success) {
            this.metrics.failedApiCalls++;
        }
        
        // Keep history manageable
        if (this.metrics.apiCalls.length > this.maxMetricsHistory) {
            this.metrics.apiCalls.shift();
        }
        
        this.updateApiStats();
    }
    
    recordVirtualizationMetrics(stats) {
        Object.assign(this.metrics.virtualizationStats, stats);
    }
    
    recordScrollEvent() {
        this.metrics.virtualizationStats.scrollEvents++;
        this.isScrolling = true;
        
        // Reset scrolling flag after a delay
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.isScrolling = false;
        }, 150);
    }
    
    recordError(type, error, filename = '', lineno = 0) {
        this.metrics.errorCount++;
        // Use setTimeout to avoid blocking the main thread
        setTimeout(() => {
            console.error(`Performance Monitor - ${type}:`, error, filename, lineno);
        }, 0);
    }
    
    recordWarning(message, details = {}) {
        this.metrics.warningCount++;
        // Use setTimeout to avoid blocking the main thread
        setTimeout(() => {
            console.warn(`Performance Monitor - Warning: ${message}`, details);
        }, 0);
    }
    
    recordSlowTask(duration, name) {
        // Only log in development to reduce overhead
        if (window.browserEnv && window.browserEnv.isDevelopment) {
            setTimeout(() => {
                console.warn(`Long task detected: ${name} took ${duration.toFixed(2)}ms`);
            }, 0);
        }
    }
    
    recordLayoutShift(value) {
        // Only log in development to reduce overhead
        if (window.browserEnv && window.browserEnv.isDevelopment) {
            setTimeout(() => {
                console.warn(`Layout shift detected: ${value.toFixed(3)}`);
            }, 0);
        }
    }
    
    recordNavigation(entry) {
        console.log('Navigation timing:', {
            domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
            loadComplete: entry.loadEventEnd - entry.loadEventStart,
            firstPaint: entry.firstPaint,
            firstContentfulPaint: entry.firstContentfulPaint
        });
    }
    
    // Statistics calculations
    
    updateRenderStats() {
        if (this.metrics.renderTimes.length === 0) return;
        
        const recent = this.metrics.renderTimes.slice(-100); // Last 100 renders
        this.metrics.avgRenderTime = recent.reduce((sum, render) => 
            sum + render.duration, 0) / recent.length;
    }
    
    updateInteractionStats() {
        if (this.metrics.interactionTimes.length === 0) return;
        
        const recent = this.metrics.interactionTimes.slice(-100);
        this.metrics.avgInteractionTime = recent.reduce((sum, interaction) => 
            sum + interaction.duration, 0) / recent.length;
    }
    
    updateApiStats() {
        if (this.metrics.apiCalls.length === 0) return;
        
        const recent = this.metrics.apiCalls.slice(-100);
        const successful = recent.filter(call => call.success);
        
        if (successful.length > 0) {
            this.metrics.avgApiTime = successful.reduce((sum, call) => 
                sum + call.duration, 0) / successful.length;
        }
    }
    
    // Reporting and analysis
    
    getPerformanceReport() {
        const uptime = Date.now() - this.metrics.startTime;
        
        return {
            summary: {
                uptime: Math.round(uptime / 1000), // seconds
                isHealthy: this.isApplicationHealthy(),
                score: this.calculatePerformanceScore()
            },
            rendering: {
                averageRenderTime: Math.round(this.metrics.avgRenderTime * 100) / 100,
                slowRenders: this.metrics.slowRenders,
                totalRenders: this.metrics.renderTimes.length,
                slowRenderPercentage: this.metrics.renderTimes.length > 0 
                    ? (this.metrics.slowRenders / this.metrics.renderTimes.length * 100).toFixed(1)
                    : 0
            },
            interactions: {
                averageInteractionTime: Math.round(this.metrics.avgInteractionTime * 100) / 100,
                slowInteractions: this.metrics.slowInteractions,
                totalInteractions: this.metrics.interactionTimes.length
            },
            api: {
                averageApiTime: Math.round(this.metrics.avgApiTime * 100) / 100,
                failedCalls: this.metrics.failedApiCalls,
                totalCalls: this.metrics.apiCalls.length,
                successRate: this.metrics.apiCalls.length > 0 
                    ? ((this.metrics.apiCalls.length - this.metrics.failedApiCalls) / this.metrics.apiCalls.length * 100).toFixed(1)
                    : 100
            },
            memory: {
                current: this.formatBytes(this.metrics.avgMemoryUsage),
                leaks: this.metrics.memoryLeaks.length,
                snapshots: this.metrics.memorySnapshots.length
            },
            virtualization: this.metrics.virtualizationStats,
            errors: {
                errorCount: this.metrics.errorCount,
                warningCount: this.metrics.warningCount
            }
        };
    }
    
    isApplicationHealthy() {
        return this.metrics.avgRenderTime < this.thresholds.renderTime * 2 &&
               this.metrics.avgInteractionTime < this.thresholds.interactionTime &&
               this.metrics.errorCount === 0;
    }
    
    calculatePerformanceScore() {
        let score = 100;
        
        // Penalize slow renders
        if (this.metrics.renderTimes.length > 0) {
            const slowRenderPercentage = this.metrics.slowRenders / this.metrics.renderTimes.length;
            score -= slowRenderPercentage * 30;
        }
        
        // Penalize slow interactions
        if (this.metrics.interactionTimes.length > 0) {
            const slowInteractionPercentage = this.metrics.slowInteractions / this.metrics.interactionTimes.length;
            score -= slowInteractionPercentage * 20;
        }
        
        // Penalize API failures
        if (this.metrics.apiCalls.length > 0) {
            const failureRate = this.metrics.failedApiCalls / this.metrics.apiCalls.length;
            score -= failureRate * 25;
        }
        
        // Penalize errors
        score -= this.metrics.errorCount * 5;
        score -= this.metrics.warningCount * 1;
        
        return Math.max(0, Math.round(score));
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Control methods
    
    startReporting(intervalMs = 60000) { // Default: every minute
        this.stopReporting(); // Clear any existing interval
        
        this.reportInterval = setInterval(() => {
            const report = this.getPerformanceReport();
            console.group('🔍 Performance Report');
            console.table(report.summary);
            console.table(report.rendering);
            console.table(report.interactions);
            console.table(report.api);
            console.groupEnd();
        }, intervalMs);
    }
    
    stopReporting() {
        if (this.reportInterval) {
            clearInterval(this.reportInterval);
            this.reportInterval = null;
        }
    }
    
    reset() {
        this.metrics = {
            renderTimes: [],
            avgRenderTime: 0,
            slowRenders: 0,
            memorySnapshots: [],
            avgMemoryUsage: 0,
            memoryLeaks: [],
            interactionTimes: [],
            avgInteractionTime: 0,
            slowInteractions: 0,
            apiCalls: [],
            avgApiTime: 0,
            failedApiCalls: 0,
            virtualizationStats: {
                itemsRendered: 0,
                itemsVisible: 0,
                scrollEvents: 0,
                averageScrollFPS: 0
            },
            startTime: Date.now(),
            errorCount: 0,
            warningCount: 0
        };
    }
    
    destroy() {
        this.stopReporting();
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        this.isMonitoring = false;
    }
}

// React hook for performance monitoring
function usePerformanceMonitor() {
    const { useRef, useCallback, useEffect } = React;
    const monitor = useRef(null);
    
    useEffect(() => {
        if (!monitor.current) {
            monitor.current = new PerformanceMonitor();
        }
        
        return () => {
            if (monitor.current) {
                monitor.current.destroy();
            }
        };
    }, []);
    
    const measureRender = useCallback((componentName) => {
        if (!monitor.current) return null;
        return monitor.current.startRenderMeasurement(componentName);
    }, []);
    
    const endMeasurement = useCallback((measurement) => {
        if (!monitor.current || !measurement) return;
        return monitor.current.endRenderMeasurement(measurement);
    }, []);
    
    const recordInteraction = useCallback((type, duration, details) => {
        if (!monitor.current) return;
        monitor.current.recordInteraction(type, duration, details);
    }, []);
    
    const getReport = useCallback(() => {
        if (!monitor.current) return null;
        return monitor.current.getPerformanceReport();
    }, []);
    
    return {
        measureRender,
        endMeasurement,
        recordInteraction,
        getReport,
        monitor: monitor.current
    };
}

// Global performance monitor instance
window.performanceMonitor = new PerformanceMonitor();

// Export for module systems
window.PerformanceMonitor = PerformanceMonitor;
window.usePerformanceMonitor = usePerformanceMonitor;