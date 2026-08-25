import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Keys that should stay fresh in the background while the app is open
// (installed PWA on home screen, or an open browser tab). TanStack Query
// already refetches on window focus / network reconnect; the interval
// covers the case where the app sits open for a long time.
const BACKGROUND_SYNC_KEYS = ["products", "categories", "transactions"] as const;
const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // Cached data is served instantly on revisit; a background refresh
        // keeps it accurate without blocking the UI.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: 1,
      },
    },
  });

  for (const key of BACKGROUND_SYNC_KEYS) {
    queryClient.setQueryDefaults([key], {
      refetchInterval: BACKGROUND_SYNC_INTERVAL_MS,
      refetchIntervalInBackground: true,
      staleTime: 30_000,
    });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading the target route's JS chunk on hover/focus of a Link,
    // so clicking feels instant even on first visit.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
