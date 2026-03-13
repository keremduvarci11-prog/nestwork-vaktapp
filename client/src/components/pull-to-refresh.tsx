import { useState, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface PullToRefreshProps {
  children: React.ReactNode;
}

export function PullToRefresh({ children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const threshold = 80;

  const isAtTop = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    let scrollParent: HTMLElement | null = el;
    while (scrollParent) {
      if (scrollParent.scrollTop > 0) return false;
      scrollParent = scrollParent.parentElement;
    }
    return window.scrollY === 0;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    if (isAtTop()) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, [refreshing, isAtTop]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 120));
    }
  }, [pulling, refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pulling) return;
    if (pullDistance >= threshold) {
      setRefreshing(true);
      setPullDistance(threshold);
      await queryClient.invalidateQueries();
      await new Promise((r) => setTimeout(r, 500));
      setRefreshing(false);
    }
    setPullDistance(0);
    setPulling(false);
  }, [pulling, pullDistance, queryClient]);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: pullDistance > 0 ? pullDistance : 0 }}
      >
        <RefreshCw
          className={`w-5 h-5 text-primary transition-transform ${refreshing ? "animate-spin" : ""}`}
          style={{
            transform: `rotate(${(pullDistance / threshold) * 360}deg)`,
            opacity: Math.min(pullDistance / threshold, 1),
          }}
        />
      </div>
      {children}
    </div>
  );
}
