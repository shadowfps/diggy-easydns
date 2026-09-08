import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { SearchBar } from '@/modules/search/SearchBar';
import { ScoreCard } from '@/modules/score/ScoreCard';
import { QuickFacts } from '@/modules/score/QuickFacts';
import { RecordsList } from '@/modules/records/RecordsList';
import { PropagationView } from '@/modules/propagation/PropagationView';
import { FindingsList } from '@/modules/findings/FindingsList';
import { SecurityView } from '@/modules/security/SecurityView';
import { MailView } from '@/modules/mail/MailView';
import { WhoisView } from '@/modules/whois/WhoisView';
import { PageSpeedView } from '@/modules/speed/PageSpeedView';
import { VirusScanView } from '@/modules/virusscan/VirusScanView';
import { HistoryView } from '@/modules/history/HistoryView';
import { AboutView } from '@/modules/about/AboutView';
import { ImpressumView } from '@/modules/impressum/ImpressumView';
import { DatenschutzView } from '@/modules/datenschutz/DatenschutzView';
import { AvailabilityView } from '@/modules/availability/AvailabilityView';
import { IpResultView } from '@/modules/ip/IpResultView';
import { ConverterPromo } from '@/modules/promo/ConverterPromo';
import { isInspectableIp } from '@/components/ip/IpAddressLink';
import { Tabs, type TabId } from '@/components/ui/Tabs';
import {
  ScoreCardSkeleton,
  SectionCardsSkeleton,
  PropagationSkeleton,
  WhoisSkeleton,
  ListSkeleton,
} from '@/components/ui/Skeleton';
import { Loader2 } from 'lucide-react';
import SplitText from '@/components/ui/SplitText';
import TextType from '@/components/ui/TextType';
import ShinyText from '@/components/ui/ShinyText';
import { lookupPageSpeed, lookupVirusScan } from '@/lib/api';
import { useProgressiveLookup } from '@/hooks/useProgressiveLookup';
import { cn } from '@/lib/cn';
import {
  clearLookupHistory,
  readLookupHistory,
  saveLookupToHistory,
  type LookupHistoryEntry,
} from '@/lib/lookupHistory';
import type { DnssecInfo, PageSpeedReport, PageSpeedStrategy, VirusScanReport } from '@/types/dns';

type AppView = 'lookup' | 'history' | 'availability' | 'about' | 'impressum' | 'datenschutz';

const NO_DNSSEC: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

/** Pfad → View für die statischen Routen. Einzige Quelle für beide Richtungen. */
const STATIC_ROUTES: Record<string, AppView | undefined> = {
  '/': 'lookup',
  '/history': 'history',
  '/about': 'about',
  '/availability': 'availability',
  '/impressum': 'impressum',
  '/datenschutz': 'datenschutz',
};

export default function App() {
  const [view, setView] = useState<AppView>('lookup');
  const lookup = useProgressiveLookup();
  const [ipQuery, setIpQuery] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<LookupHistoryEntry[]>(() =>
    readLookupHistory()
  );
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

  const report = lookup.report;
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
    window.scrollTo({ top: 0, behavior: records || ipQuery ? 'smooth' : 'auto' });
    runLookup(domain);
  };

  // Records da → Permalink auf die (server-normalisierte) Domain setzen.
  useEffect(() => {
    if (lookup.recordsStatus === 'done' && lookup.domain) {
      replaceLookupPath(lookup.domain);
    }
  }, [lookup.recordsStatus, lookup.domain]);

  // Alle Sektionen fertig → vollständigen Report in die History schreiben.
  useEffect(() => {
    if (lookup.allSettled && lookup.report) {
      setHistoryEntries(saveLookupToHistory(lookup.report));
    }
  }, [lookup.allSettled, lookup.report]);

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
      if (staticView === 'history') setHistoryEntries(readLookupHistory());
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

  // Ref bei jedem Render auf die frische Closure zeigen lassen.
  applyPathRef.current = applyPath;

  /** Navigiert per pushState und wendet den Pfad direkt an. */
  const navigate = (pathname: string) => {
    if (window.location.pathname !== pathname) {
      window.history.pushState(null, '', pathname);
    }
    applyPath(pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHome = () => navigate('/');
  const handleHistory = () => navigate('/history');
  const handleAbout = () => navigate('/about');
  const handleAvailability = () => navigate('/availability');
  const handleImpressum = () => navigate('/impressum');
  const handleDatenschutz = () => navigate('/datenschutz');

  const handleClearHistory = () => {
    setHistoryEntries(clearLookupHistory());
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Erstes Laden: Deep-Link/Permalink anwenden.
  useEffect(() => {
    if (initialPathHandledRef.current) return;
    initialPathHandledRef.current = true;
    applyPath(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        (mailData.mtaSts.present ? 1 : 0) || undefined
    : undefined;
  const securityLoading = ssl.status === 'loading' || dnssec.status === 'loading';

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <Header
        onHome={handleHome}
        onHistory={handleHistory}
        onAvailability={handleAvailability}
        onAbout={handleAbout}
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

        {view === 'impressum' && <ImpressumView />}

        {view === 'datenschutz' && <DatenschutzView />}

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
                <ShinyText
                  text="diggy"
                  className="font-brand font-bold text-5xl md:text-7xl tracking-tight lowercase dark:invert"
                  color="#111111"
                  shineColor="#737373"
                  speed={2.5}
                  spread={120}
                  direction="left"
                />
              </motion.div>
              <div className="mb-3">
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
              </div>
              <div className="mb-10 max-w-md mx-auto">
                <TextType
                  as="p"
                  className="text-base text-ink-900/60 dark:text-ink-50/60"
                  text={[
                    'DNS, SSL, Mail-Security und Propagation auf einen Blick.',
                    'Ohne Fachchinesisch, mit Empfehlungen.',
                    'Alles, was du wissen musst — in einem Tool.',
                  ]}
                  typingSpeed={45}
                  pauseDuration={2200}
                  deletingSpeed={25}
                  cursorCharacter="▍"
                  cursorClassName="text-ink-900 dark:text-ink-50"
                  cursorBlinkDuration={0.6}
                  initialDelay={500}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === 'lookup' && (
          <SearchBar
            value={searchValue}
            onValueChange={setSearchValue}
            focusSignal={searchFocusSignal}
            autoFocus={autoFocusSearch}
            onSearch={handleSearch}
            loading={recordsLoading}
          />
        )}

        {/* Promo für das Schwester-Tool — nur auf der Landing-Page (Idle) */}
        <AnimatePresence>
          {view === 'lookup' && lookup.recordsStatus === 'idle' && !ipQuery && (
            <ConverterPromo key="converter-promo" />
          )}
        </AnimatePresence>

        {/* Loading State — nur bis die Records da sind. Danach übernimmt der
            Report mit Skeletons für die noch ladenden Sektionen. */}
        <AnimatePresence>
          {view === 'lookup' && recordsLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto mt-10 max-w-2xl text-center"
            >
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-ink-900 dark:text-ink-50" />
              <p className="mt-3 text-sm text-ink-900/60 dark:text-ink-50/60">
                Records werden geholt…
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* IP-Adresse → Reverse-DNS/PTR-Ansicht */}
        {view === 'lookup' && ipQuery && !recordsLoading && <IpResultView ip={ipQuery} />}

        {/* Error */}
        {view === 'lookup' && recordsErrored && (
          <div className="mx-auto mt-8 max-w-2xl rounded-xl bg-red-500/10 p-4 text-center text-sm text-red-600 dark:text-red-400">
            {lookup.recordsError}
          </div>
        )}

        {/* Report */}
        {showReport && report && (
          <motion.div
            key={report.domain + report.timestamp}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className="mx-auto mt-6 w-full max-w-[110rem] md:mt-8"
          >
              <div className="text-center mb-5">
                <span className="font-mono text-base text-ink-900/60 dark:text-ink-50/60">
                  {report.domain}
                </span>
              </div>

              {/* Score + Quick Facts */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {lookup.allSettled ? <ScoreCard score={lookup.healthScore} /> : <ScoreCardSkeleton />}
                <QuickFacts
                  records={report.records}
                  ssl={ssl}
                  dnssec={dnssec}
                  mail={mail}
                  techStack={techStack}
                  onUseDomain={handleUseDomainInSearch}
                />
              </div>

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
                  { id: 'speed', label: 'Speed', count: pageSpeed ? 1 : undefined },
                  {
                    id: 'virusscan',
                    label: 'Virus Scan',
                    count: virusScan
                      ? (virusScan.stats.malicious + virusScan.stats.suspicious) || undefined
                      : undefined,
                  },
                ]}
              />

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
                    {activeTab === 'records' && (
                      <RecordsList
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
                        <PropagationView results={propagation.data} />
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
                        <SecurityView
                          ssl={ssl.data ?? undefined}
                          dnssec={dnssec.data ?? NO_DNSSEC}
                        />
                      ))}
                    {activeTab === 'mail' &&
                      (mail.status === 'loading' ? (
                        <SectionCardsSkeleton count={4} />
                      ) : mail.status === 'error' ? (
                        <SectionError message={mail.error} />
                      ) : mailData ? (
                        <MailView mail={mailData} />
                      ) : (
                        <SectionCardsSkeleton count={4} />
                      ))}
                    {activeTab === 'whois' &&
                      (whois.status === 'loading' ? (
                        <WhoisSkeleton />
                      ) : whois.status === 'error' ? (
                        <SectionError message={whois.error} />
                      ) : (
                        <WhoisView whois={whois.data ?? undefined} onUseDomain={handleUseDomainInSearch} />
                      ))}
                    {activeTab === 'speed' && (
                      <PageSpeedView
                        data={pageSpeed}
                        loading={pageSpeedLoading}
                        error={pageSpeedError}
                        strategy={pageSpeedStrategy}
                        onStrategyChange={setPageSpeedStrategy}
                        onRun={handleRunPageSpeed}
                      />
                    )}
                    {activeTab === 'virusscan' && (
                      <VirusScanView
                        data={virusScan}
                        loading={virusScanLoading}
                        error={virusScanError}
                        onRun={handleRunVirusScan}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer-Actions */}
              <div className="mt-12 flex justify-end gap-2">
                <ActionButton onClick={handleExportJson}>Export JSON</ActionButton>
                <ActionButton onClick={handleCopyPermalink}>
                  {permalinkCopied ? 'Link kopiert' : 'Permalink kopieren'}
                </ActionButton>
                <ActionButton>Watch 🔔</ActionButton>
              </div>
          </motion.div>
        )}
      </main>

      <footer className="border-t border-ink-100 px-6 py-8 dark:border-ink-900 md:px-8">
        <div className="flex flex-col gap-3 text-xs text-ink-900/40 dark:text-ink-50/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>diggy · DNS made friendly</span>
            <span className="hidden text-ink-900/20 dark:text-ink-50/20 sm:inline" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={handleImpressum}
              className="transition-colors hover:text-ink-900/70 dark:hover:text-ink-50/70"
            >
              Impressum
            </button>
            <span className="hidden text-ink-900/20 dark:text-ink-50/20 sm:inline" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={handleDatenschutz}
              className="transition-colors hover:text-ink-900/70 dark:hover:text-ink-50/70"
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
  return (
    <div className="surface rounded-xl p-12 text-center">
      <h3 className="text-base font-medium mb-1">{title}</h3>
      <p className="text-sm text-ink-900/50 dark:text-ink-50/50">{subtitle}</p>
    </div>
  );
}

function SectionError({ message }: { message?: string }) {
  return (
    <div className="surface rounded-xl p-8 text-center text-sm text-red-600 dark:text-red-400">
      {message ?? 'Dieser Check ist fehlgeschlagen.'}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-2 text-xs font-medium rounded-lg border border-ink-100 dark:border-ink-900/80 hover:bg-ink-100/60 dark:hover:bg-ink-900 transition-colors"
    >
      {children}
    </button>
  );
}

function getLookupUrl(domain: string): string {
  return `${window.location.origin}/lookup/${encodeURIComponent(domain)}`;
}

function replaceLookupPath(domain: string): void {
  const nextPath = `/lookup/${encodeURIComponent(domain)}`;
  if (window.location.pathname === nextPath) return;
  window.history.replaceState(null, '', nextPath);
}

function getDomainFromLookupPath(pathname: string): string | null {
  const match = pathname.match(/^\/lookup\/([^/]+)\/?$/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return null;
  }
}

function normalizeSearchDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

function sanitizeFilename(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
}

function formatExportTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'report';
  return date.toISOString().replace(/[:.]/g, '-');
}
