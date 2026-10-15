import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Ganzseitiger Fallback — die App als Ganzes ist nicht mehr benutzbar.
 *
 * Aufgebaut wie `EmptyState` mit `tone="danger"`, aber von Hand: der Titel
 * muss hier die `h1` der Seite bleiben (EmptyState setzt eine `h3`), und die
 * Fehlermeldung steht unter den Aktionen.
 */
export function AppErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card flex w-full max-w-md flex-col items-center py-10 text-center sm:py-12">
        <span className="icon-tile icon-tile-danger size-11">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-4 text-base font-semibold text-fg">Da ist etwas schiefgelaufen</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Die Ansicht konnte nicht dargestellt werden. Ein Neuladen hilft meistens.
        </p>
        <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Neu laden
          </button>
          {/*
            Die App ist URL-basiert: ein kaputter Permalink würde beim Neuladen
            wieder in denselben Fehler laufen. Deshalb zusätzlich ein Weg zurück
            auf die Startseite.
          */}
          <a href="/" className="btn btn-secondary">
            Zur Startseite
          </a>
        </div>
        <p className="mt-5 wrap-break-word font-mono text-[11px] text-fg-subtle">
          {error.message}
        </p>
      </div>
    </div>
  );
}

/**
 * Fallback für einen einzelnen Report-Tab.
 *
 * Passt zur progressiven Ladearchitektur: im Netzwerk-Pfad darf eine Sektion
 * ausfallen, ohne den Report zu killen (sectionError im Hook). Im Render-Pfad
 * galt das bisher nicht — ein defekter Sektions-Renderer riss die ganze App mit.
 *
 * Sekundärbutton: im Report ist der Primärbutton schon die Suche.
 */
export function SectionErrorFallback({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      tone="danger"
      icon={<AlertTriangle className="size-5" />}
      title="Dieser Bereich konnte nicht dargestellt werden"
      action={
        <button type="button" onClick={reset} className="btn btn-secondary btn-sm">
          Erneut versuchen
        </button>
      }
      className="py-8 sm:py-8"
    >
      Die übrigen Bereiche des Reports funktionieren weiter.
    </EmptyState>
  );
}
