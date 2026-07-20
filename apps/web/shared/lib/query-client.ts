import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { ApiError } from "./api-client";
import { getCurrentLocale } from "./current-locale";

const messages = { fr, en };

// Lets individual mutations attach a success toast message, or opt out of
// the generic error toast when they handle the error themselves (e.g. an
// inline form error) — see AGENTS.md / docs on centralized request feedback.
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      successMessage?: string;
      skipGlobalErrorToast?: boolean;
    };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return messages[getCurrentLocale()].Toasts.genericError;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        toast.error(errorMessage(error));
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.skipGlobalErrorToast) return;
        toast.error(errorMessage(error));
      },
      onSuccess: (_data, _variables, _context, mutation) => {
        const message = mutation.meta?.successMessage;
        if (message) toast.success(message);
      },
    }),
  });
}

let browserQueryClient: QueryClient | undefined;

// Server: always a fresh client (no state leaking between requests).
// Browser: one stable client for the lifetime of the tab.
export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
