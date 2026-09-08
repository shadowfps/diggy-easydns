import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /**
   * Wird anstelle der Kinder gerendert, wenn es knallt. Bekommt eine
   * `reset`-Funktion, um es nochmal zu versuchen.
   */
  fallback: (context: { error: Error; reset: () => void }) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Fängt Render-Fehler ab, statt den ganzen Baum abzuräumen.
 *
 * Nötig, weil die Views Daten aus Fremd-APIs verarbeiten, die nirgends gegen
 * ein Schema geprüft werden — `getJson` in lib/api.ts castet die Antwort blind.
 * Ein unerwartetes Datumsformat aus einer RDAP-Antwort oder ein fehlendes Feld
 * in einem alten History-Eintrag führte damit zur weißen Seite ohne Meldung.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Ohne Log wäre der Fehler nach dem Fallback-Render nicht mehr auffindbar.
    console.error('[diggy] Render-Fehler abgefangen:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (error) return this.props.fallback({ error, reset: this.reset });
    return this.props.children;
  }
}
