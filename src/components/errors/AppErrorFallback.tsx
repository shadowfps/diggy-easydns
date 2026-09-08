import { AlertTriangle } from 'lucide-react';

/** Ganzseitiger Fallback — die App als Ganzes ist nicht mehr benutzbar. */
export function AppErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="surface w-full max-w-md rounded-2xl p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 h-6 w-6 text-red-500" />
        <h1 className="mb-2 text-lg font-medium">Da ist etwas schiefgelaufen</h1>
        <p className="mb-6 text-sm text-ink-900/60 dark:text-ink-50/60">
          Die Ansicht konnte nicht dargestellt werden. Ein Neuladen hilft meistens.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-ink-200"
          >
            Neu laden
          </button>
          {/*
            Die App ist URL-basiert: ein kaputter Permalink würde beim Neuladen
            wieder in denselben Fehler laufen. Deshalb zusätzlich ein Weg zurück
            auf die Startseite.
          */}
          <a
            href="/"
            className="rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-ink-100/60 dark:border-ink-800 dark:hover:bg-ink-900"
          >
            Zur Startseite
          </a>
        </div>
        <p className="mt-5 break-words font-mono text-[11px] text-ink-900/35 dark:text-ink-50/35">
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
 */
export function SectionErrorFallback({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="surface rounded-xl p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 h-5 w-5 text-red-500" />
      <h3 className="mb-1 text-base font-medium">Dieser Bereich konnte nicht dargestellt werden</h3>
      <p className="mb-4 text-sm text-ink-900/55 dark:text-ink-50/55">
        Die übrigen Bereiche des Reports funktionieren weiter.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-ink-200 px-3.5 py-2 text-xs font-medium transition-colors hover:bg-ink-100/60 dark:border-ink-800 dark:hover:bg-ink-900"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
