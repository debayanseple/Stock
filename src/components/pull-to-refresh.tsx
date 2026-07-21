import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

type Props = {
  onRefresh: () => void | Promise<unknown>;
  children: ReactNode;
  /** Element that owns the scroll. Defaults to window. */
  scrollElement?: HTMLElement | null;
  /** Distance in px the user must pull to trigger refresh. */
  threshold?: number;
  /** Enable on desktop too. Defaults to mobile-only. */
  alwaysEnabled?: boolean;
  className?: string;
};

export function PullToRefresh({
  onRefresh,
  children,
  scrollElement,
  threshold = 70,
  alwaysEnabled = false,
  className,
}: Props) {
  const isMobile = useIsMobile();
  const enabled = alwaysEnabled || isMobile;
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const getScrollTop = () => {
      if (scrollElement === undefined) {
        return window.scrollY || document.documentElement.scrollTop || 0;
      }
      return scrollElement?.scrollTop ?? 0;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (getScrollTop() > 0) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Resistance curve
      const eased = Math.min(threshold * 1.6, dy * 0.5);
      setPull(eased);
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      if (pull >= threshold) {
        setRefreshing(true);
        setPull(threshold);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, onRefresh, pull, refreshing, scrollElement, threshold]);

  const progress = Math.min(1, pull / threshold);
  const showIndicator = enabled && (pull > 0 || refreshing);

  return (
    <div ref={containerRef} className={className}>
      {showIndicator && (
        <div
          className="flex items-center justify-center overflow-hidden text-primary transition-[height] duration-150"
          style={{ height: refreshing ? threshold : pull }}
          aria-hidden
        >
          <RefreshCw
            className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
          />
        </div>
      )}
      <div
        style={{
          transform: !refreshing && pull > 0 ? `translateY(${pull * 0.15}px)` : undefined,
          transition: pulling.current ? undefined : "transform 150ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}