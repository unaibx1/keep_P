// Performance optimization utilities

// Memory cache for expensive operations
class MemoryCache<T> {
  private cache = new Map<string, { value: T; timestamp: number; ttl: number }>();

  set(key: string, value: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle utility
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Lazy loading utility
export function lazyLoad<T>(
  loader: () => Promise<T>,
  cacheKey?: string
): () => Promise<T> {
  let cached: T | null = null;
  let loading: Promise<T> | null = null;

  return async () => {
    if (cached) return cached;
    if (loading) return loading;

    loading = loader();
    try {
      cached = await loading;
      return cached;
    } finally {
      loading = null;
    }
  };
}

// Performance monitoring
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private marks: Map<string, number> = new Map();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();
    
    if (!start) {
      console.warn(`Start mark "${startMark}" not found`);
      return 0;
    }

    const duration = end - start;
    this.recordMetric(name, duration);
    return duration;
  }

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
  }

  getAverageMetric(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  getMetrics(): Record<string, { average: number; count: number; min: number; max: number }> {
    const result: Record<string, { average: number; count: number; min: number; max: number }> = {};
    
    for (const [name, values] of this.metrics) {
      if (values.length > 0) {
        result[name] = {
          average: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }
    }
    
    return result;
  }

  clear(): void {
    this.metrics.clear();
    this.marks.clear();
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Resource preloader
export class ResourcePreloader {
  private preloaded = new Set<string>();

  async preloadImage(src: string): Promise<void> {
    if (this.preloaded.has(src)) return;
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.preloaded.add(src);
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  async preloadScript(src: string): Promise<void> {
    if (this.preloaded.has(src)) return;
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.onload = () => {
        this.preloaded.add(src);
        resolve();
      };
      script.onerror = reject;
      script.src = src;
      document.head.appendChild(script);
    });
  }

  async preloadStylesheet(href: string): Promise<void> {
    if (this.preloaded.has(href)) return;
    
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.onload = () => {
        this.preloaded.add(href);
        resolve();
      };
      link.onerror = reject;
      link.href = href;
      document.head.appendChild(link);
    });
  }
}

// Global resource preloader
export const resourcePreloader = new ResourcePreloader();

// Intersection Observer for lazy loading
export function createLazyLoader(
  callback: (entry: IntersectionObserverEntry) => void,
  options: IntersectionObserverInit = {}
): IntersectionObserver {
  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        callback(entry);
      }
    });
  }, {
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  });
}

// Virtual scrolling utilities
export function createVirtualScroller<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) {
  const totalHeight = items.length * itemHeight;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  
  return {
    getVisibleRange(scrollTop: number) {
      const start = Math.floor(scrollTop / itemHeight);
      const end = Math.min(start + visibleCount + overscan, items.length);
      const startWithOverscan = Math.max(0, start - overscan);
      
      return {
        start: startWithOverscan,
        end,
        items: items.slice(startWithOverscan, end),
        offsetY: startWithOverscan * itemHeight
      };
    },
    
    getTotalHeight() {
      return totalHeight;
    }
  };
}

// Memory management
export function cleanupMemory(): void {
  // Clear any caches
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        if (cacheName.includes('temp') || cacheName.includes('old')) {
          caches.delete(cacheName);
        }
      });
    });
  }
  
  // Clear performance monitor if it has too many metrics
  const metrics = performanceMonitor.getMetrics();
  if (Object.keys(metrics).length > 100) {
    performanceMonitor.clear();
  }
}

// Export cache instance for use in other modules
export const memoryCache = new MemoryCache();

// Performance optimization decorator
export function optimize<T extends (...args: any[]) => any>(
  cacheKey?: string,
  ttl: number = 5 * 60 * 1000
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const key = cacheKey || `${target.constructor.name}_${propertyName}_${JSON.stringify(args)}`;
      const cached = memoryCache.get(key);
      
      if (cached) {
        return cached;
      }
      
      const result = await method.apply(this, args);
      memoryCache.set(key, result, ttl);
      return result;
    };
  };
}
