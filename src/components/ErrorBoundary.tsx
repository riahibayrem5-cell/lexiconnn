import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Route-level error boundary. Prevents a single render error from blanking
 * the whole app. Resets when `resetKey` (e.g. pathname) changes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console; production observability can be wired here.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center px-6">
          <div className="luxury-panel rounded-sm p-8 max-w-lg text-center space-y-4">
            <p className="mono text-[0.6rem] tracking-[0.3em] uppercase text-primary">
              Something broke
            </p>
            <h2 className="font-display text-2xl text-foreground">
              This page hit a snag.
            </h2>
            <p className="font-serif italic text-sm text-muted-foreground">
              {this.state.error.message || "Unknown error"}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button onClick={this.reset} variant="outline" className="font-display tracking-wider">
                <RotateCcw className="h-4 w-4 mr-2" /> Try again
              </Button>
              <Button onClick={() => (window.location.href = "/")} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
                Back to shelf
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
