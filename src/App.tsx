import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from '@/components/layout/Header';
import { SearchBar } from '@/modules/search/SearchBar';
import { ScoreCard } from '@/modules/score/ScoreCard';
import { QuickFacts } from '@/modules/score/QuickFacts';
import { RecordsList } from '@/modules/records/RecordsList';
import { PropagationView } from '@/modules/propagation/PropagationView';
import { FindingsList } from '@/modules/findings/FindingsList';
import { WhoisView } from '@/modules/whois/WhoisView';

import { HistoryView } from '@/modules/history/HistoryView';
import { AboutView } from '@/modules/about/AboutView';
import { AvailabilityView } from '@/modules/availability/AvailabilityView';
import { IpResultView } from '@/modules/ip/IpResultView';
import { ConverterPromo } from '@/modules/promo/ConverterPromo';
import { CheckOverview } from '@/modules/home/CheckOverview';
import { usePreviousCheck } from '@/modules/changes/usePreviousCheck';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { Tabs, type TabId } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { PageErrorFallback, SectionErrorFallback } from '@/components/errors/AppErrorFallback';
import {
  ScoreCardSkeleton,
  SectionCardsSkeleton,
  PropagationSkeleton,
  WhoisSkeleton,
  ListSkeleton,
  SinceLastCheckSkeleton,
} from '@/components/ui/Skeleton';
import { AlertTriangle, Check, Download, Link2, Loader2 } from 'lucide-react';
import { lazy, Suspense } from 'react';

/*
 * Die drei Hero-Komponenten werden nachgeladen.
 *
 * Alle drei erscheinen ausschließlich auf der Startseite im Idle-Zustand. Wer
 * über einen Permalink (/lookup/<domain>) einsteigt, sieht sie nie — hat ihren
 * Code aber bisher im kritischen Pfad geladen. Zusammen bringen sie GSAP
 * (Core, SplitText-Plugin, ScrollTrigger) mit, das bei aktivem "Bewegung
 * reduzieren" sogar geladen, initialisiert und dann bewusst nicht benutzt wurde.
 *
 * SplitText und TextType rendern ihren Text ohnehin als Kind bzw. progressiv,
 * die Fallbacks entsprechen also dem Endzustand.
 */
const SplitText = lazy(() => import('@/components/ui/SplitText'));
const TextType = lazy(() => import('@/components/ui/TextType'));
const ShinyText = lazy(() => import('@/components/ui/ShinyText'));

/*
 * Die beiden On-Demand-Tabs: sie holen ihre Daten erst, wenn der Nutzer den
 * Check ausdrücklich anstößt. Ihr Code gehört damit nicht in das Bundle, das
 * den ersten Report blockiert.
 */
const PageSpeedView = lazy(() =>
  import('@/modules/speed/PageSpeedView').then((m) => ({ default: m.PageSpeedView }))
);
const VirusScanView = lazy(() =>
  import('@/modules/virusscan/VirusScanView').then((m) => ({ default: m.VirusScanView }))
);

/*
 * Der Mail-Tab: Seine Daten lädt der Report sofort, die Ansicht braucht aber
 * erst der Klick auf den Tab. Mit BIMI und TLS-RPT (#83) wäre index.js sonst
 * über sein Budget gewachsen (47,05 → 48,31 kB gzip bei 48 kB Grenze);
 * nachgeladen sind es 3,6 kB, die niemanden beim ersten Report aufhalten.
 * Vorgeladen wird, sobald die Mail-Daten da sind (siehe App) — dann steht die
 * Ansicht beim Klick schon bereit, statt erst ein Skeleton zu zeigen.
 */
const loadMailView = () => import('@/modules/mail/MailView');
const MailView = lazy(() => loadMailView().then((m) => ({ default: m.MailView })));

/*
 * „Seit dem letzten Check“ erscheint nur bei einem erneuten Check derselben
 * Domain und erst nach dem Report — Vergleichslogik und Texte (rund 3 kB
 * gzip) müssen den ersten Report nicht aufhalten.
 */
const SinceLastCheck = lazy(() =>
  import('@/modules/changes/SinceLastCheck').then((m) => ({ default: m.SinceLastCheck }))
);

/*
 * Bundle-Budget (index.js ≤ 48 kB gzip, scripts/check-bundle-size.mjs): mit
 * dem Vergleich (#79) und dem Kalender (#84) lag index.js bei 48,5 kB. Statt
 * die Grenze anzuheben, kommen zwei Dinge aus dem kritischen Pfad, die den
 * ersten Report nicht aufhalten müssen:
 *
 * - Der Sicherheits-Tab: SSL und DNSSEC lädt der Report sofort, die Ansicht
 *   braucht erst der Klick auf den Tab. Vorgeladen wird, sobald einer der
 *   beiden Checks fertig ist (siehe App) — dann steht sie beim Klick bereit.
 * - Impressum und Datenschutz: reiner Text auf eigenen Seiten, zusammen rund
 *   5 kB gzip, die bisher jeder Aufruf mitlud.
 */
const loadSecurityView = () => import('@/modules/security/SecurityView');
const SecurityView = lazy(() => loadSecurityView().then((m) => ({ default: m.SecurityView })));
const ImpressumView = lazy(() =>
  import('@/modules/impressum/ImpressumView').then((m) => ({ default: m.ImpressumView }))
);
const DatenschutzView = lazy(() =>
  import('@/modules/datenschutz/DatenschutzView').then((m) => ({ default: m.DatenschutzView }))
);
import { lookupPageSpeed, lookupVirusScan } from '@/lib/api';
import { useProgressiveLookup } from '@/hooks/useProgressiveLookup';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import { isDnsOnlyName } from '@/lib/dnsName';
import { propagationTypes } from '@/lib/propagation';
import {
  buildDocumentTitle,
  formatExportTimestamp,
  getDomainFromLookupPath,
  lookupPathFor,
  normalizeSearchDomain,
  sanitizeFilename,
  STATIC_ROUTES,
  type AppView,
} from '@/lib/lookupPath';
import {
  clearLookupHistory,
  saveLookupToHistory,
  useLookupHistory,
} from '@/lib/lookupHistory';
import type { PageSpeedReport, PageSpeedStrategy, VirusScanReport } from '@/types/dns';

export default function App() {
  const [view, setView] = useState<AppView>('lookup');
  const lookup = useProgressiveLookup();
  const [ipQuery, setIpQuery] = useState<string | null>(null);
  const historyEntries = useLookupHistory();
  const [pageSpeed, setPageSpeed] = useState<PageSpeedReport | null>(null);
  const [pageSpeedLoading, setPageSpeedLoading] = useState(false);
  const [pageSpeedError, setPageSpeedError] = useState<string | null>(null);
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<PageSpeedStrategy>('mobile');
  const [virusScan, setVirusScan] = useState<VirusScanReport | null>(null);
  const [virusScanLoading, setVirusScanLoading] = useState(false);
  const [virusScanError, setVirusScanError] = useState<string | null>(null);
  const [permalinkCopied, setPermalinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('records');
  const [searchValue, setSearchValue] = useState('');
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const initialPathHandledRef = useRef(false);
  // applyPath schließt über aktuellen State. Der popstate-Listener wird nur
  // einmal gebunden, greift die Funktion aber über diese Ref ab, damit er
  // nicht auf einer veralteten Closure sitzt.
  const applyPathRef = useRef<(pathname: string) => void>(() => {});
  // Beim Direktaufruf der Startseite soll der Cursor sofort im Suchfeld stehen,
  // damit man ohne Klick per Strg+V einfügen und suchen kann. Bei Deep-Links
  // (Permalink oder Unterseite) übernimmt der Routing-Effekt.
  const [autoFocusSearch] = useState(() => window.location.pathname === '/');
  // „Bewegung reduzieren“: springen statt gleiten. Das sanfte Scrollen per JS
  // erreicht weder MotionConfig noch die CSS-Regel in globals.css.
  const smoothScroll: ScrollBehavior = useReducedMotion() ? 'auto' : 'smooth';

  const report = lookup.report;
  // Muss vor dem Speichern unten gelesen werden — siehe usePreviousCheck.
  const previousCheck = usePreviousCheck(report);
  const records = lookup.records;
  const recordsLoading = lookup.recordsStatus === 'loading';
  const recordsErrored = lookup.recordsStatus === 'error';
  const showReport = view === 'lookup' && lookup.recordsStatus === 'done' && records;

  const resetSecondaryScans = () => {
    setPageSpeed(null);
    setPageSpeedError(null);
    setPageSpeedLoading(false);
    setPageSpeedStrategy('mobile');
    setVirusScan(null);
    setVirusScanError(null);
    setVirusScanLoading(false);
  };

  /** Räumt den kompletten Lookup-State ab (beim Verlassen der Lookup-Ansicht). */
  const clearLookup = () => {
    lookup.reset();
    setIpQuery(null);
    resetSecondaryScans();
    setPermalinkCopied(false);
  };

  const runLookup = (domain: string, options: { updatePath?: boolean } = {}) => {
    const normalizedDomain = domain.trim().toLowerCase();
    if (!normalizedDomain) return;
    setView('lookup');
    setSearchValue(normalizedDomain);
    resetSecondaryScans();

    // Reine IP-Adresse → Reverse-DNS/PTR-Ansicht statt Domain-Lookup.
    if (isInspectableIp(normalizedDomain)) {
      lookup.reset();
      setIpQuery(normalizedDomain);
      if (options.updatePath !== false) replaceLookupPath(normalizedDomain);
      return;
    }

    setIpQuery(null);
    setActiveTab('records');
    lookup.run(normalizedDomain);
  };

  const handleSearch = (domain: string) => {
    window.scrollTo({ top: 0, behavior: records || ipQuery ? smoothScroll : 'auto' });
    /*
     * Eintrag nur anlegen, wenn wir NICHT schon auf einem Lookup-Pfad sind.
     *
     * Die Bedingung hing vorher an `records || ipQuery` und war damit
     * inkonsistent: während ein Lookup lädt, ist `records` bereits null (der
     * Reducer setzt beim Start auf INITIAL), eine Suche in diesem Moment legte
     * also einen Eintrag an — nach dem Laden dagegen nicht. Und ein erneuter
     * Versuch derselben Domain nach einem Fehler erzeugte einen doppelten
     * Eintrag mit identischer URL.
     *
     * Der Pfad ist die verlässlichere Quelle: von einer statischen Route aus
     * pushState, innerhalb der Lookup-Ansicht übernimmt replaceLookupPath.
     */
    if (!window.location.pathname.startsWith('/lookup/')) {
      const target = domain.trim().toLowerCase();
      if (target) window.history.pushState(null, '', lookupPathFor(target));
    }
    runLookup(domain);
  };

  // Records da → Permalink auf die (server-normalisierte) Domain setzen.
  useEffect(() => {
    if (lookup.recordsStatus === 'done' && lookup.domain) {
      replaceLookupPath(lookup.domain);
    }
  }, [lookup.recordsStatus, lookup.domain]);

  // Alle Sektionen fertig → vollständigen Report in die History schreiben.
  // Fehlgeschlagene Sektionen mit, damit der nächste Vergleich sie auslässt.
  useEffect(() => {
    if (lookup.allSettled && lookup.report) {
      saveLookupToHistory(lookup.report, lookup.failed);
    }
  }, [lookup.allSettled, lookup.report, lookup.failed]);

  const handleRunVirusScan = async () => {
    if (!lookup.domain || virusScanLoading) return;
    setVirusScanError(null);
    setVirusScanLoading(true);
    try {
      const result = await lookupVirusScan(lookup.domain);
      setVirusScan(result);
    } catch (e) {
      setVirusScanError(e instanceof Error ? e.message : 'VirusTotal-Scan fehlgeschlagen');
    } finally {
      setVirusScanLoading(false);
    }
  };

  const handleRunPageSpeed = async () => {
    if (!lookup.domain || pageSpeedLoading) return;
    setPageSpeedError(null);
    setPageSpeedLoading(true);
    try {
      const result = await lookupPageSpeed(lookup.domain, pageSpeedStrategy);
      setPageSpeed(result);
    } catch (e) {
      setPageSpeedError(e instanceof Error ? e.message : 'PageSpeed fehlgeschlagen');
    } finally {
      setPageSpeedLoading(false);
    }
  };

  /**
   * Wendet einen Pfad auf den State an — ohne die History zu verändern.
   *
   * Wird von zwei Seiten gebraucht: beim ersten Laden (Deep-Link/Permalink)
   * und bei `popstate`. Vorher gab es nur den Init-Pfad, deshalb hat der
   * Zurück-Button nur die URL geändert und die Ansicht stehen gelassen.
   */
  const applyPath = (pathname: string) => {
    const staticView = STATIC_ROUTES[pathname];
    if (staticView) {
      clearLookup();
      setView(staticView);
      // Auch Suchfeld und Tab zurücksetzen. Das machte das alte handleHome()
      // und ist beim Zusammenfassen der fünf Handler verloren gegangen: die
      // SearchBar wird bei view==='lookup' nicht neu gemountet, also blieb
      // nach Home/Zurück die alte Domain im Feld stehen.
      setSearchValue('');
      setActiveTab('records');
      return;
    }

    const domainFromPath = getDomainFromLookupPath(pathname);
    if (domainFromPath) {
      // Der Pfad steht schon — nicht erneut hineinschreiben, sonst würde ein
      // replaceState den History-Eintrag überschreiben, zu dem wir gerade
      // zurückgesprungen sind.
      runLookup(domainFromPath, { updatePath: false });
      return;
    }

    // Unbekannter Pfad → Startseite.
    clearLookup();
    setView('lookup');
    setActiveTab('records');
    setSearchValue('');
  };

  /*
   * Ref nach jedem Render auf die frische Closure zeigen lassen.
   *
   * Stand vorher direkt im Render-Körper. react-hooks/refs beanstandet das:
   * während des Renders darf eine Ref weder gelesen noch geschrieben werden,
   * sonst hängt ihr Inhalt davon ab, ob React den Render am Ende behält.
   * Der Effect ohne Dependency-Array läuft nach jedem Commit — früh genug,
   * denn der popstate-Listener greift die Funktion erst beim Event ab.
   */
  useEffect(() => {
    applyPathRef.current = applyPath;
  });

  /** Navigiert per pushState und wendet den Pfad direkt an. */
  const navigate = (pathname: string) => {
    if (window.location.pathname !== pathname) {
      window.history.pushState(null, '', pathname);
    }
    applyPath(pathname);
    window.scrollTo({ top: 0, behavior: smoothScroll });
  };

  // Aus der Score-Karte: Tab wechseln und die Tab-Leiste in Sicht holen — auf
  // dem Handy liegt sie sonst unter der Schnellübersicht außer Sicht.
  const handleShowFindings = () => {
    setActiveTab('findings');
    document.getElementById('tab-findings')?.scrollIntoView({ behavior: smoothScroll, block: 'nearest' });
  };

  const handleHome = () => navigate('/');
  const handleHistory = () => navigate('/history');
  const handleAbout = () => navigate('/about');
  const handleAvailability = () => navigate('/availability');
  const handleImpressum = () => navigate('/impressum');
  const handleDatenschutz = () => navigate('/datenschutz');

  const handleClearHistory = () => {
    clearLookupHistory();
  };

  const handleUseDomainInSearch = (domain: string) => {
    const nextValue = normalizeSearchDomain(domain);
    if (!nextValue) return;
    setView('lookup');
    setSearchValue(nextValue);
    setSearchFocusSignal((value) => value + 1);
    if (!records && window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: smoothScroll });
  };

  // Erstes Laden: Deep-Link/Permalink anwenden.
  useEffect(() => {
    if (initialPathHandledRef.current) return;
    initialPathHandledRef.current = true;
    applyPath(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Dokumenttitel mitführen.
   *
   * Permalinks sind ein Kernfeature — ohne das hießen alle offenen Tabs
   * "diggy — DNS made friendly" und waren beim Vergleich mehrerer Domains
   * nicht unterscheidbar, ebenso Lesezeichen und Browser-History.
   */
  useEffect(() => {
    document.title = buildDocumentTitle(view, lookup.domain, ipQuery);
  }, [view, lookup.domain, ipQuery]);

  // Zurück/Vorwärts im Browser. Ohne diesen Listener änderte sich nur die URL.
  useEffect(() => {
    const handlePopState = () => applyPathRef.current(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleCopyPermalink = async () => {
    if (!lookup.domain) return;
    const url = getLookupUrl(lookup.domain);
    try {
      await navigator.clipboard.writeText(url);
      setPermalinkCopied(true);
      window.setTimeout(() => setPermalinkCopied(false), 1400);
    } catch {
      // Fallback für Browser ohne Clipboard-API-Rechte.
      window.prompt('Permalink kopieren:', url);
    }
  };

  const handleExportJson = () => {
    if (!report) return;
    const filename = `diggy-${sanitizeFilename(report.domain)}-${formatExportTimestamp(report.timestamp)}.json`;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const lookupHasOutput =
    view === 'lookup' && Boolean(records || recordsLoading || recordsErrored || ipQuery);

  const { propagation, dnssec, ssl, mail, whois, techStack } = lookup.sections;
  const mailData = mail.data;
  const mailCount = mailData
    ? (mailData.spf.present ? 1 : 0) +
        (mailData.dmarc.present ? 1 : 0) +
        mailData.dkim.selectors.length +
        (mailData.mtaSts.present ? 1 : 0) +
        (mailData.tlsRpt?.present ? 1 : 0) +
        (mailData.bimi?.present ? 1 : 0) || undefined
    : undefined;
  const securityLoading = ssl.status === 'loading' || dnssec.status === 'loading';
  const dnsOnly = lookup.domain !== null && isDnsOnlyName(lookup.domain);

  // Sicherheits- und Mail-Tab vorladen, sobald es etwas zu zeigen gibt — nach
  // dem ersten Render, also ohne den Report aufzuhalten. Scheitert es (etwa ein
  // Chunk von vor dem letzten Deploy), meldet sich der Tab über seine Boundary.
  const hasSecurityData = ssl.status === 'done' || dnssec.status === 'done';
  useEffect(() => {
    if (hasSecurityData) loadSecurityView().catch(() => {});
  }, [hasSecurityData]);
  const hasMailData = Boolean(mailData);
  useEffect(() => {
    if (hasMailData) loadMailView().catch(() => {});
  }, [hasMailData]);

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <Header
        onHome={handleHome}
        onHistory={handleHistory}
        onAvailability={handleAvailability}
        onAbout={handleAbout}
        // Auf Report-Seiten wandert die Suche in die Kopfzeile: der Report
        // beginnt oben, und die Suche bleibt beim Scrollen erreichbar.
        search={
          lookupHasOutput ? (
            <SearchBar
              variant="compact"
              value={searchValue}
              onValueChange={setSearchValue}
              focusSignal={searchFocusSignal}
              onSearch={handleSearch}
              loading={recordsLoading}
            />
          ) : undefined
        }
      />

      <main
        className={cn(
          'flex-1 min-w-0 px-4 sm:px-6 lg:px-8 [overflow-anchor:none]',
          view !== 'lookup' || lookupHasOutput ? 'py-6 md:py-8' : 'py-12 md:py-20'
        )}
      >
        {view === 'history' && (
          <HistoryView
            entries={historyEntries}
            onRun={handleSearch}
            onUseDomain={handleUseDomainInSearch}
            onClear={handleClearHistory}
          />
        )}

        {view === 'about' && <AboutView />}

        {view === 'availability' && <AvailabilityView />}

        {(view === 'impressum' || view === 'datenschutz') && (
          // Nachgeladen (siehe oben). Scheitert der Chunk, bleibt die App
          // drumherum bedienbar, statt ganz in den Fehler zu fallen.
          <ErrorBoundary key={view} fallback={() => <PageErrorFallback />}>
            <Suspense fallback={null}>
              {view === 'impressum' ? (
                <ImpressumView onOpenDatenschutz={handleDatenschutz} />
              ) : (
                <DatenschutzView onOpenImpressum={handleImpressum} />
              )}
            </Suspense>
          </ErrorBoundary>
        )}

        {/* Hero / Search */}
        {/* Kein mode="wait" — sonst kann ein hängender Exit den nächsten
            Render blockieren. Da ein Loading-Zwischenstate sowieso die
            Lücke füllt, gibt es kein Overlap-Risiko. */}
        <AnimatePresence>
          {view === 'lookup' && lookup.recordsStatus === 'idle' && !ipQuery && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20, pointerEvents: 'none' }}
              className="mx-auto mb-10 max-w-5xl text-center"
            >
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-5"
              >
                <Suspense
                  fallback={
                    <span className="font-brand font-bold text-5xl md:text-7xl tracking-tight lowercase text-fg">
                      diggy
                    </span>
                  }
                >
                  <ShinyText
                    text="diggy"
                    className="font-brand font-bold text-5xl md:text-7xl tracking-tight lowercase dark:invert"
                    color="#111111"
                    shineColor="#737373"
                    speed={2.5}
                    spread={120}
                    direction="left"
                  />
                </Suspense>
              </motion.div>
              <div className="mb-3">
                <Suspense
                  fallback={
                    <h1 className="text-4xl md:text-5xl font-medium tracking-tight">
                      Was steckt hinter deiner Domain?
                    </h1>
                  }
                >
                  <SplitText
                    text="Was steckt hinter deiner Domain?"
                    tag="h1"
                    className="text-4xl md:text-5xl font-medium tracking-tight"
                    delay={40}
                    duration={0.9}
                    ease="power3.out"
                    splitType="chars"
                    from={{ opacity: 0, y: 30 }}
                    to={{ opacity: 1, y: 0 }}
                    threshold={0.1}
                    rootMargin="-50px"
                    textAlign="center"
                  />
                </Suspense>
              </div>
              <div className="mb-10 max-w-md mx-auto">
                <Suspense
                  fallback={
                    <p className="text-base text-fg-muted">
                      DNS, SSL, Mail-Security und Propagation auf einen Blick.
                    </p>
                  }
                >
                  <TextType
                    as="p"
                    className="text-base text-fg-muted"
                    text={[
                      'DNS, SSL, Mail-Security und Propagation auf einen Blick.',
                      'Ohne Fachchinesisch, mit Empfehlungen.',
                      'Alles, was du wissen musst — in einem Tool.',
                    ]}
                    typingSpeed={45}
                    pauseDuration={2200}
                    deletingSpeed={25}
                    cursorCharacter="▍"
                    cursorClassName="text-fg"
                    cursorBlinkDuration={0.6}
                    initialDelay={500}
                  />
                </Suspense>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === 'lookup' && !lookupHasOutput && (
          <SearchBar
            value={searchValue}
            onValueChange={setSearchValue}
            focusSignal={searchFocusSignal}
            autoFocus={autoFocusSearch}
            onSearch={handleSearch}
            loading={recordsLoading}
            recent={historyEntries}
          />
        )}

        {/* Was diggy prüft + Promo für das Schwester-Tool — nur auf der
            Landing-Page (Idle) */}
        <AnimatePresence>
          {view === 'lookup' && lookup.recordsStatus === 'idle' && !ipQuery && (
            <CheckOverview key="check-overview" />
          )}
          {view === 'lookup' && lookup.recordsStatus === 'idle' && !ipQuery && (
            <ConverterPromo key="converter-promo" />
          )}
        </AnimatePresence>

        {/* Loading State — nur bis die Records da sind. Danach übernimmt der
            Report mit Skeletons für die noch ladenden Sektionen. role="status",
            damit der Text angesagt wird: bei „Bewegung reduzieren“ steht der
            Spinner still und trägt den Ladezustand nicht mehr mit. */}
        <AnimatePresence>
          {view === 'lookup' && recordsLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="status"
              className="mx-auto mt-10 max-w-2xl text-center"
            >
              <Loader2 className="mx-auto size-6 animate-spin text-fg" />
              <p className="mt-3 text-sm text-fg-muted">
                Records werden geholt…
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* IP-Adresse → Reverse-DNS/PTR-Ansicht */}
        {view === 'lookup' && ipQuery && !recordsLoading && <IpResultView ip={ipQuery} />}

        {/* Error */}
        {view === 'lookup' && recordsErrored && (
          <div className="mx-auto mt-10 max-w-2xl">
            <SectionError message={lookup.recordsError ?? undefined} />
          </div>
        )}

        {/* Report */}
        {showReport && report && (
          <motion.div
            key={report.domain + report.timestamp}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            // Ab xl zwei Spalten: links die Zusammenfassung, die beim Scrollen
            // mitläuft, rechts die Tabs. Darunter ist die rechte Spalte zu
            // schmal für die zweispaltigen Tab-Inhalte — dort wird gestapelt.
            className="mx-auto w-full max-w-[110rem] xl:grid xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start xl:gap-8"
          >
            <aside
              aria-label="Zusammenfassung"
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:sticky xl:top-20 xl:grid-cols-1"
            >
              {/* Report-Kopf: was geprüft wurde, wann, und was man damit tun kann.
                  Export und Permalink standen vorher unter allen Tabs am
                  Seitenende — wer sie suchte, musste erst durchscrollen. */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:col-span-2 xl:col-span-1 xl:flex-col xl:items-start xl:justify-start">
                <div className="min-w-0">
                  <p className="eyebrow">DNS-Report</p>
                  <h1 className="mt-1.5 break-all font-mono text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                    {report.domain}
                  </h1>
                  <p className="mt-1.5 text-sm text-fg-muted">
                    Geprüft am {formatCheckedAt(report.timestamp)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <ActionButton onClick={handleExportJson}>
                    <Download className="size-3.5" />
                    Export JSON
                  </ActionButton>
                  <ActionButton onClick={handleCopyPermalink}>
                    {permalinkCopied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
                    {permalinkCopied ? 'Link kopiert' : 'Permalink kopieren'}
                  </ActionButton>
                </div>
              </div>

              {/* Score + Quick Facts */}
              {lookup.allSettled ? (
                <ScoreCard
                  score={lookup.healthScore}
                  findings={lookup.findings}
                  failed={lookup.failed}
                  onShowFindings={handleShowFindings}
                />
              ) : (
                <ScoreCardSkeleton />
              )}
              <QuickFacts
                records={report.records}
                ssl={ssl}
                dnssec={dnssec}
                mail={mail}
                techStack={techStack}
                onUseDomain={handleUseDomainInSearch}
              />
            </aside>

            <div className="mt-8 min-w-0 xl:mt-0">
              {/* Über den Tabs statt in der Seitenspalte: die soll flach
                  bleiben (docs/DESIGN.md), und hier ist Platz für die Liste.
                  Beim ersten Lookup einer Domain gibt es nichts zu zeigen. */}
              {previousCheck && (
                // Eigene Boundary: scheitert das Nachladen (alter Chunk nach
                // einem Deploy) oder der Vergleich an kaputten History-Daten,
                // fehlt nur diese Karte — nicht der ganze Report.
                <ErrorBoundary key={report.timestamp} fallback={() => null}>
                  <Suspense fallback={<SinceLastCheckSkeleton className="mb-6" />}>
                    <SinceLastCheck
                      previous={previousCheck}
                      report={report}
                      failed={lookup.failed}
                      settled={lookup.allSettled}
                      className="mb-6"
                    />
                  </Suspense>
                </ErrorBoundary>
              )}

              {/* Tabs */}
              <Tabs
                active={activeTab}
                onChange={setActiveTab}
                tabs={[
                  { id: 'records', label: 'Records', count: report.records.length },
                  {
                    id: 'propagation',
                    label: 'Propagation',
                    count: propagation.data?.length || undefined,
                  },
                  { id: 'security', label: 'Security' },
                  { id: 'mail', label: 'Mail', count: mailCount },
                  {
                    id: 'findings',
                    label: 'Findings',
                    count: lookup.allSettled ? lookup.findings.length : undefined,
                  },
                  {
                    id: 'whois',
                    label: 'WHOIS',
                    count: whois.status === 'done' && whois.data ? 1 : undefined,
                  },
                  // Bei DNS-Einträgen wie `_dmarc.example.com` hätten Speed und
                  // Virus Scan (brauchen eine Website) nichts zu zeigen.
                  ...(dnsOnly
                    ? []
                    : [
                        { id: 'speed' as const, label: 'Speed', count: pageSpeed ? 1 : undefined },
                        {
                          id: 'virusscan' as const,
                          label: 'Virus Scan',
                          count: virusScan
                            ? (virusScan.stats.malicious + virusScan.stats.suspicious) || undefined
                            : undefined,
                        },
                      ]),
                ]}
              />

              {/* Zweite, feinere Boundary: reißt ein Sektions-Renderer ab,
                  bleiben Score, QuickFacts und die anderen Tabs nutzbar.
                  key auf activeTab, damit ein Tab-Wechsel den Fehlerzustand
                  nicht mitschleppt. */}
              <ErrorBoundary
                key={`boundary-${activeTab}`}
                fallback={({ error, reset }) => (
                  <div className="mt-6">
                    <SectionErrorFallback error={error} reset={reset} />
                  </div>
                )}
              >
              <div className="mt-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    role="tabpanel"
                    id={`panel-${activeTab}`}
                    aria-labelledby={`tab-${activeTab}`}
                    tabIndex={0}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* key pro Domain: RecordsList und PropagationView halten
                        lokalen Filter-/Typ-State. Ohne Remount blieb der über
                        einen Domain-Wechsel hinweg stehen — bei
                        PropagationView führte das zu einer scheinbar leeren
                        Ansicht, wenn die neue Domain den vorher gewählten
                        Record-Typ nicht hat. */}
                    {activeTab === 'records' && (
                      <RecordsList
                        key={report.domain}
                        records={report.records}
                        onUseDomain={handleUseDomainInSearch}
                      />
                    )}
                    {activeTab === 'propagation' &&
                      (propagation.status === 'loading' ? (
                        <PropagationSkeleton />
                      ) : propagation.status === 'error' ? (
                        <SectionError message={propagation.error} />
                      ) : propagation.data && propagation.data.length > 0 ? (
                        <PropagationView
                          key={report.domain}
                          results={propagation.data}
                          types={propagationTypes(report.domain)}
                        />
                      ) : (
                        <Placeholder
                          title="Multi-Resolver-Propagation"
                          subtitle="Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen."
                        />
                      ))}
                    {activeTab === 'findings' &&
                      (lookup.allSettled ? (
                        <FindingsList findings={lookup.findings} />
                      ) : (
                        <ListSkeleton rows={5} />
                      ))}
                    {activeTab === 'security' &&
                      (securityLoading ? (
                        <SectionCardsSkeleton count={2} />
                      ) : (
                        <Suspense fallback={<SectionCardsSkeleton count={2} />}>
                          <SecurityView
                            domain={report.domain}
                            ssl={ssl}
                            sslApplicable={!dnsOnly}
                            dnssec={dnssec}
                          />
                        </Suspense>
                      ))}
                    {activeTab === 'mail' &&
                      (mail.status === 'loading' ? (
                        <SectionCardsSkeleton count={4} />
                      ) : mail.status === 'error' ? (
                        <SectionError message={mail.error} />
                      ) : mailData ? (
                        <Suspense fallback={<SectionCardsSkeleton count={4} />}>
                          <MailView mail={mailData} />
                        </Suspense>
                      ) : (
                        <SectionCardsSkeleton count={4} />
                      ))}
                    {activeTab === 'whois' &&
                      (whois.status === 'loading' ? (
                        <WhoisSkeleton />
                      ) : whois.status === 'error' ? (
                        <SectionError message={whois.error} />
                      ) : (
                        <WhoisView
                          domain={report.domain}
                          whois={whois.data ?? undefined}
                          onUseDomain={handleUseDomainInSearch}
                        />
                      ))}
                    {activeTab === 'speed' && (
                      <Suspense fallback={<SectionCardsSkeleton count={2} />}>
                      <PageSpeedView
                        data={pageSpeed}
                        loading={pageSpeedLoading}
                        error={pageSpeedError}
                        strategy={pageSpeedStrategy}
                        onStrategyChange={setPageSpeedStrategy}
                        onRun={handleRunPageSpeed}
                      />
                      </Suspense>
                    )}
                    {activeTab === 'virusscan' && (
                      <Suspense fallback={<SectionCardsSkeleton count={2} />}>
                      <VirusScanView
                        data={virusScan}
                        loading={virusScanLoading}
                        error={virusScanError}
                        onRun={handleRunVirusScan}
                      />
                      </Suspense>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
              </ErrorBoundary>
            </div>
          </motion.div>
        )}
      </main>

      <footer className="mt-16 border-t border-line-subtle px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>diggy · DNS made friendly</span>
            <span className="hidden text-line sm:inline" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={handleImpressum}
              className="transition-colors hover:text-fg"
            >
              Impressum
            </button>
            <span className="hidden text-line sm:inline" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={handleDatenschutz}
              className="transition-colors hover:text-fg"
            >
              Datenschutz
            </button>
          </div>
          <span>v0.3.0</span>
        </div>
      </footer>
    </div>
  );
}

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return <EmptyState title={title}>{subtitle}</EmptyState>;
}

function SectionError({ message }: { message?: string }) {
  return (
    <EmptyState tone="danger" icon={<AlertTriangle className="size-5" />}>
      {message ?? 'Dieser Check ist fehlgeschlagen.'}
    </EmptyState>
  );
}

/**
 * `onClick` ist bewusst verpflichtend: ein Button ohne Handler ist für Nutzer
 * nicht von einem kaputten unterscheidbar. So fängt der Compiler das ab.
 */
function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-secondary btn-sm"
    >
      {children}
    </button>
  );
}

function formatCheckedAt(timestamp: string): string {
  return new Date(timestamp).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function getLookupUrl(domain: string): string {
  return `${window.location.origin}${lookupPathFor(domain)}`;
}

function replaceLookupPath(domain: string): void {
  const nextPath = lookupPathFor(domain);
  if (window.location.pathname === nextPath) return;
  window.history.replaceState(null, '', nextPath);
}

