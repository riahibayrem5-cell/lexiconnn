import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth";
import { LangProvider } from "@/lib/i18n";
import Shelf from "./pages/Shelf"; // eager: default route, fastest first paint

const Auth = lazy(() => import("./pages/Auth"));
const BookBrain = lazy(() => import("./pages/BookBrain"));
const Review = lazy(() => import("./pages/Review"));
const Oracle = lazy(() => import("./pages/Oracle"));
const Ritual = lazy(() => import("./pages/Ritual"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Archive = lazy(() => import("./pages/Archive"));
const Settings = lazy(() => import("./pages/Settings"));
const Recommendations = lazy(() => import("./pages/Recommendations"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

const History = lazy(() => import("./pages/History"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen grid place-items-center text-muted-foreground font-display tracking-[0.3em] text-xs">
    <span className="lang-en">LOADING…</span>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LangProvider>
        <BrowserRouter>
          <AuthProvider>
            <TooltipProvider delayDuration={150}>
              <Toaster />
              <Sonner />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Shelf />} />
                    <Route path="/book/:id" element={<BookBrain />} />
                    <Route path="/review" element={<Review />} />
                    <Route path="/oracle" element={<Oracle />} />
                    <Route path="/ritual" element={<Ritual />} />
                    <Route path="/quotes" element={<Quotes />} />
                    <Route path="/archive" element={<Archive />} />
                    <Route path="/recommendations" element={<Recommendations />} />

                    <Route path="/history" element={<History />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/admin" element={<AdminPanel />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </TooltipProvider>
          </AuthProvider>
        </BrowserRouter>
      </LangProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
