import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ArrowDown, Check } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  disabled = false,
  children,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasVibrated, setHasVibrated] = useState(false);

  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);

  // Sync ref with state
  isRefreshingRef.current = isRefreshing;
  pullDistanceRef.current = pullDistance;

  const PULL_THRESHOLD = 75; // px distance to trigger refresh
  const MAX_PULL = 110; // max px distance

  const isModalOpen = useCallback((): boolean => {
    // Prevent pull-to-refresh if a modal, dialog, or overlay is currently open
    return Boolean(
      document.querySelector('[role="dialog"]') ||
      document.querySelector('.fixed.inset-0.z-50') ||
      document.querySelector('.fixed.inset-0.z-\\[70\\]') ||
      document.querySelector('.fixed.inset-0.z-\\[80\\]') ||
      document.querySelector('.fixed.inset-0.z-\\[85\\]')
    );
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshingRef.current) return;
      if (isModalOpen()) return;

      // Only engage if at the absolute top of the page
      if (window.scrollY <= 0 && document.documentElement.scrollTop <= 0) {
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
        setHasVibrated(false);
      } else {
        isPullingRef.current = false;
      }
    },
    [disabled, isModalOpen]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPullingRef.current || disabled || isRefreshingRef.current) return;
      if (isModalOpen()) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      // If user has scrolled down, cancel pull
      if (window.scrollY > 0 || document.documentElement.scrollTop > 0) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const rawDiff = currentY - startYRef.current;

      if (rawDiff > 0) {
        // Elastic pull resistance formula
        const dampened = Math.min(MAX_PULL, Math.pow(rawDiff, 0.85));
        setPullDistance(dampened);

        // Haptic feedback once threshold is crossed
        if (dampened >= PULL_THRESHOLD && !hasVibrated) {
          try {
            navigator.vibrate?.(12);
          } catch {
            // Ignore if vibrate not supported
          }
          setHasVibrated(true);
        }

        // Prevent native overscroll glitch when dragging down at top
        if (e.cancelable && rawDiff > 5) {
          e.preventDefault();
        }
      } else {
        setPullDistance(0);
      }
    },
    [disabled, hasVibrated, isModalOpen]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;

    const currentDist = pullDistanceRef.current;

    if (currentDist >= PULL_THRESHOLD && !isRefreshingRef.current) {
      setIsRefreshing(true);
      setPullDistance(52); // Keep indicator visible during refresh

      try {
        await Promise.resolve(onRefresh());
      } catch (err) {
        console.error('Pull to refresh failed:', err instanceof Error ? err.message : String(err));
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
          setHasVibrated(false);
        }, 350);
      }
    } else {
      setPullDistance(0);
      setHasVibrated(false);
    }
  }, [onRefresh, PULL_THRESHOLD]);

  useEffect(() => {
    // Register touch listeners on window with non-passive touchmove for pull prevention
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const isReady = pullDistance >= PULL_THRESHOLD;
  const rotationAngle = Math.min(180, (pullDistance / PULL_THRESHOLD) * 180);

  return (
    <div className="relative min-h-screen">
      {/* Floating Native-Style Pull Indicator for Mobile */}
      <div
        className="fixed left-0 right-0 top-0 z-40 flex justify-center pointer-events-none transition-transform duration-200 ease-out"
        style={{
          transform: `translateY(${pullDistance > 0 ? pullDistance : -60}px)`,
          opacity: pullDistance > 10 ? Math.min(1, pullDistance / 40) : 0,
        }}
        aria-hidden="true"
      >
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-md backdrop-blur-md text-xs font-semibold text-slate-700 dark:text-slate-200">
          {isRefreshing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <span>Refreshing data...</span>
            </>
          ) : isReady ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400">Release to refresh</span>
            </>
          ) : (
            <>
              <ArrowDown
                className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 transition-transform duration-100"
                style={{ transform: `rotate(${rotationAngle}deg)` }}
              />
              <span>Pull down to refresh</span>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {children}
    </div>
  );
};
