import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { I18nProvider, RouterProvider } from 'react-aria-components';
import {
  Button,
  CounterBadge,
  Heading,
  Icon,
  IconCheck,
  IconDanger,
  IconDownload,
  IconLink,
  LayoutCard,
  Link,
  LoadingSpinner,
  Tab,
  Tabs,
  TabTitle,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@mittwald/flow-react-components';
import { IconArrowsLeftRight } from '@tabler/icons-react';
import { Header } from '@/components/layout/Header';
import { SearchBar } from '@/modules/search/SearchBar';
import { ScoreCard } from '@/modules/score/ScoreCard';
import { QuickFacts } from '@/modules/score/QuickFacts';
import { RecordsList } from '@/modules/records/RecordsList';
import { FindingsList } from '@/modules/findings/FindingsList';
import { WhoisView } from '@/modules/whois/WhoisView';

import { IpResultView } from '@/modules/ip/IpResultView';
import { ConverterPromo } from '@/modules/promo/ConverterPromo';
import { CheckOverview } from '@/modules/home/CheckOverview';
import { usePreviousCheck } from '@/modules/changes/usePreviousCheck';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { PageErrorFallback, SectionErrorFallback } from '@/components/errors/AppErrorFallback';
import {
  ScoreCardSkeleton,
  SectionCardsSkeleton,
  PropagationSkeleton,
  WhoisSkeleton,
  ListSkeleton,
  LegalPageSkeleton,
  PageSkeleton,
  SinceLastCheckSkeleton,
} from '@/components/ui/Skeleton';
import styles from './App.module.css';

/** Die Bereiche des Reports, in der Reihenfolge der Tabs. */
export type TabId = 'records' | 'propagation' | 'security' | 'mail' | 'findings' | 'whois' | 'speed' | 'virusscan';

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
// Der Vergleich ist eine eigene Seite, die man bewusst aufruft — sein Code
// muss nicht im Bundle stecken, das den ersten Report blockiert.
const CompareView = lazy(() =>
  import('@/modules/compare/CompareView').then((m) => ({ default: m.CompareView }))
);

/*
 * Ebenso die übrigen eigenen Seiten. Mit Flow wiegen sie mehr als vorher:
 * History nutzt Flows List (TanStack Table, MobX, Luxon), der Available Check
 * Flows Form (react-hook-form, zod). Im kritischen Pfad kosteten sie jeden
 * Aufruf rund 100 kB gzip, auch wer nur einen Report öffnet.
 */
const HistoryView = lazy(() =>
  import('@/modules/history/HistoryView').then((m) => ({ default: m.HistoryView }))
);
const AboutView = lazy(() => import('@/modules/about/AboutView').then((m) => ({ default: m.AboutView })));
const AvailabilityView = lazy(() =>
  import('@/modules/availability/AvailabilityView').then((m) => ({ default: m.AvailabilityView }))
);

/*
 * Der Mail-Tab: Seine Daten lädt der Report sofort, die Ansicht braucht aber
 * erst der Klick auf den Tab. Nachgeladen kostet sie niemanden etwas beim
 * ersten Report. Vorgeladen wird, sobald die Mail-Daten da sind (siehe App) —
 * dann steht die Ansicht beim Klick schon bereit, statt erst ein Skeleton zu
 * zeigen.
 */
const loadMailView = () => import('@/modules/mail/MailView');
const MailView = lazy(() => loadMailView().then((m) => ({ default: m.MailView })));

/*
 * Der Propagation-Tab, aus demselben Grund. Vorgeladen wird, sobald die
 * Propagation-Daten da sind (siehe App).
 */
const loadPropagationView = () => import('@/modules/propagation/PropagationView');
const PropagationView = lazy(() =>
  loadPropagationView().then((m) => ({ default: m.PropagationView }))
);

/*
 * „Seit dem letzten Check“ erscheint nur bei einem erneuten Check derselben
 * Domain und erst nach dem Report — Vergleichslogik und Texte müssen den
 * ersten Report nicht aufhalten.
 */
const SinceLastCheck = lazy(() =>
  import('@/modules/changes/SinceLastCheck').then((m) => ({ default: m.SinceLastCheck }))
);

/*
 * Aus dem kritischen Pfad, weil sie den ersten Report nicht aufhalten müssen:
 *
 * - Der Sicherheits-Tab: SSL und DNSSEC lädt der Report sofort, die Ansicht
 *   braucht erst der Klick auf den Tab. Vorgeladen wird, sobald einer der
 *   beiden Checks fertig ist (siehe App) — dann steht sie beim Klick bereit.
 * - Impressum und Datenschutz: reiner Text auf eigenen Seiten. Je Seite ein
 *   Chunk; bis er da ist, hält ein bildschirmhoher Platzhalter den Footer unten.
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
import { buildLabel } from '@/lib/buildInfo';
import { useProgressiveLookup } from '@/hooks/useProgressiveLookup';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { isDnsOnlyName } from '@/lib/dnsName';
import {
  defaultPropagationType,
  propagationExpectedFromSearch,
  propagationTypeFromSearch,
  propagationTypes,
  type PropagationRecordType,
} from '@/lib/propagation';
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
  compareDocumentTitle,
  comparePathFor,
  getComparePairFromPath,
  type ComparePair,
} from '@/lib/comparePath';
import {
  clearLookupHistory,
  saveLookupToHistory,
  useLookupHistory,
} from '@/lib/lookupHistory';
import type { PageSpeedReport, PageSpeedStrategy, VirusScanReport } from '@/types/dns';
import { errorText, formatDate, t, useI18n } from '@/i18n';

export default function App() {
  const [view, setView] = useState<AppView>('lookup');
  const lookup = useProgressiveLookup();
  const { language } = useI18n();
  const [ipQuery, setIpQuery] = useState<string | null>(null);
  const historyEntries = useLookupHistory();
  const [pageSpeed, setPageSpeed] = useState<PageSpeedReport | null>(null);
  const [pageSpeedLoading, setPageSpeedLoading] = useState(false);
  // Der Fehler selbst, nicht seine Meldung — übersetzt wird beim Rendern.
  const [pageSpeedError, setPageSpeedError] = useState<unknown>(null);
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<PageSpeedStrategy>('mobile');
  const [virusScan, setVirusScan] = useState<VirusScanReport | null>(null);
  const [virusScanLoading, setVirusScanLoading] = useState(false);
  const [virusScanError, setVirusScanError] = useState<unknown>(null);
  const [permalinkCopied, setPermalinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('records');
  // Im Propagation-Tab gewählter Record-Typ; `null` heißt Voreinstellung (#131).
  const [propagationType, setPropagationType] = useState<PropagationRecordType | null>(null);
  // Erwarteter Wert im Propagation-Tab (#133) — gehört zum gezeigten Typ.
  const [propagationExpected, setPropagationExpected] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [comparePair, setComparePair] = useState<ComparePair>({ left: '', right: '' });
  const initialPathHandledRef = useRef(false);
  // Die Tab-Leiste — „Alle Findings“ in der Score-Karte holt sie in Sicht.
  const tabsRef = useRef<HTMLDivElement>(null);
  // applyPath schließt über aktuellen State. Der popstate-Listener wird nur
  // einmal gebunden, greift die Funktion aber über diese Ref ab, damit er
  // nicht auf einer veralteten Closure sitzt.
  const applyPathRef = useRef<(pathname: string, search: string) => void>(() => {});
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
    setPropagationType(null);
    setPropagationExpected('');
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

  const { propagation, dnssec, ssl, mail, whois, techStack } = lookup.sections;
  // Der Typ, den der Propagation-Tab zeigt: der gewählte, sonst wie bisher
  // der erste Standard-Typ mit Antwort.
  const shownPropagationType =
    propagationType ??
    (lookup.domain ? defaultPropagationType(propagation.data ?? [], propagationTypes(lookup.domain)) : null);
  const linkedPropagationType = activeTab === 'propagation' ? shownPropagationType : null;
  const linkedExpected = linkedPropagationType ? propagationExpected : '';

  /*
   * Records da → Permalink auf die (server-normalisierte) Domain setzen.
   *
   * Im Propagation-Tab steht der gezeigte Typ mit im Link
   * (`?propagation=MX`, #131): Wer die Adresse kopiert, teilt genau diese
   * Ansicht. Tab und Voreinstellung schreiben ihn per replaceState — nur die
   * Wahl eines Typs legt einen History-Eintrag an (handlePropagationType).
   * Der erwartete Wert (#133) ebenso per replaceState: ein Eintrag je
   * Tastendruck wäre eine unbrauchbare Zurück-Taste.
   *
   * Ändert sich nur der erwartete Wert, wird getippt: Dann erst nach einer
   * kurzen Pause. Safari wirft ab 100 replaceState-Aufrufen in zehn Sekunden
   * einen SecurityError — eine gedrückt gehaltene Rücktaste in einem langen
   * DKIM-Wert schafft das, und ein Fehler im Effect risse die Seite mit.
   */
  useEffect(() => {
    if (lookup.recordsStatus !== 'done' || !lookup.domain) return;
    const nextPath = lookupPathFor(lookup.domain, linkedPropagationType, linkedExpected);
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath === nextPath) return;
    const typing =
      linkedPropagationType !== null &&
      currentPath.split('&expected=')[0] === lookupPathFor(lookup.domain, linkedPropagationType);
    if (!typing) {
      replaceHistoryPath(nextPath);
      return;
    }
    const timer = window.setTimeout(() => replaceHistoryPath(nextPath), EXPECTED_LINK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [lookup.recordsStatus, lookup.domain, linkedPropagationType, linkedExpected]);

  /**
   * Typ im Propagation-Tab wählen: eigener History-Eintrag, Zurück führt zum
   * vorigen Typ — samt dessen erwartetem Wert. Der neue Typ beginnt ohne: Eine
   * IPv4-Adresse passt nicht zu AAAA.
   */
  const handlePropagationType = (type: PropagationRecordType) => {
    if (!lookup.domain || type === shownPropagationType) return;
    window.history.pushState(null, '', lookupPathFor(lookup.domain, type));
    setPropagationType(type);
    setPropagationExpected('');
  };

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
      setVirusScanError(e);
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
      setPageSpeedError(e);
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
  const applyPath = (pathname: string, search = '') => {
    // Vergleich: beide Domains stehen im Pfad, die Ansicht lädt sie selbst.
    const pair = getComparePairFromPath(pathname);
    if (pair) {
      clearLookup();
      setView('compare');
      setComparePair(pair);
      setSearchValue('');
      setActiveTab('records');
      return;
    }

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
      const linkedType = propagationTypeFromSearch(search);
      // Derselbe Report, nur ein anderer Propagation-Typ (Zurück/Vorwärts nach
      // einer Typwahl): umschalten statt alles neu zu prüfen.
      const sameReport =
        view === 'lookup' &&
        lookup.domain === domainFromPath &&
        (lookup.recordsStatus === 'done' || lookup.recordsStatus === 'loading');
      // Der Pfad steht schon — nicht erneut hineinschreiben, sonst würde ein
      // replaceState den History-Eintrag überschreiben, zu dem wir gerade
      // zurückgesprungen sind.
      if (!sameReport) runLookup(domainFromPath, { updatePath: false });
      if (linkedType !== undefined) {
        // `null` (unbekannter Typ): Tab mit Voreinstellung.
        setActiveTab('propagation');
        setPropagationType(linkedType);
        setPropagationExpected(propagationExpectedFromSearch(search));
      } else if (sameReport && activeTab === 'propagation') {
        setActiveTab('records');
      }
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

  /**
   * Ziel aller internen Links (Flows Link, Navigation, Footer): der
   * RouterProvider fängt den Klick ab und reicht die Adresse hierher. Mit
   * Strg/Cmd oder Mittelklick öffnet der Browser den Link wie gewohnt im
   * neuen Tab — das konnten die Buttons vorher nicht.
   */
  const handleRouterNavigate = (href: string) => {
    navigate(new URL(href, window.location.origin).pathname);
  };

  // Aus der Score-Karte: Tab wechseln und die Tab-Leiste in Sicht holen — auf
  // dem Handy liegt sie sonst unter der Schnellübersicht außer Sicht.
  const handleShowFindings = () => {
    setActiveTab('findings');
    tabsRef.current?.scrollIntoView({ behavior: smoothScroll, block: 'nearest' });
  };

  const handleCompare = (left = '', right = '') => navigate(comparePathFor(left, right));
  const handleOpenReport = (domain: string) => navigate(lookupPathFor(domain));

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
    applyPath(window.location.pathname, window.location.search);
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
    document.title =
      view === 'compare'
        ? compareDocumentTitle(comparePair)
        : buildDocumentTitle(view, lookup.domain, ipQuery);
    // `language`: der Titel ist übersetzt und folgt einem Sprachwechsel.
  }, [view, lookup.domain, ipQuery, comparePair, language]);

  // Zurück/Vorwärts im Browser. Ohne diesen Listener änderte sich nur die URL.
  useEffect(() => {
    const handlePopState = () =>
      applyPathRef.current(window.location.pathname, window.location.search);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleCopyPermalink = async () => {
    if (!lookup.domain) return;
    const url = getLookupUrl(lookup.domain, linkedPropagationType, linkedExpected);
    try {
      await navigator.clipboard.writeText(url);
      setPermalinkCopied(true);
      window.setTimeout(() => setPermalinkCopied(false), 1400);
    } catch {
      // Fallback für Browser ohne Clipboard-API-Rechte.
      window.prompt(t('Permalink kopieren:'), url);
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
  const hasPropagationData = propagation.status === 'done';
  useEffect(() => {
    if (hasPropagationData) loadPropagationView().catch(() => {});
  }, [hasPropagationData]);

  const showHome = view === 'lookup' && lookup.recordsStatus === 'idle' && !ipQuery;
  const headerView = view === 'lookup' ? undefined : view;

  /*
   * Inhalt eines Report-Tabs — nur für den aktiven.
   *
   * Flows `Tab` hält jedes Panel gemountet und blendet die inaktiven nur aus.
   * Für den Report hieße das: alle nachgeladenen Ansichten (Mail, Propagation,
   * Security, Speed, Virus Scan) laden sofort, ihre Effekte laufen ohne
   * geöffneten Tab, und Texte stünden mehrfach im Dokument. Deshalb rendert
   * nur der gewählte Tab seinen Inhalt.
   *
   * Feinere Boundary je Tab: reißt ein Sektions-Renderer ab, bleiben Score,
   * Schnellübersicht und die anderen Tabs nutzbar. Der Key auf dem Tab sorgt
   * dafür, dass ein Tab-Wechsel den Fehlerzustand nicht mitschleppt.
   */
  const tabContent = (tab: TabId, content: ReactNode) =>
    activeTab === tab ? (
      <ErrorBoundary
        key={`boundary-${tab}`}
        fallback={({ error, reset }) => <SectionErrorFallback error={error} reset={reset} />}
      >
        {content}
      </ErrorBoundary>
    ) : null;

  return (
    <I18nProvider locale={language === 'en' ? 'en-US' : 'de-DE'}>
      <RouterProvider navigate={handleRouterNavigate}>
        <div className={styles.app}>
          <Header
            view={headerView}
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

          <main className={styles.main} data-home={showHome ? '' : undefined}>
            {(view === 'history' || view === 'about' || view === 'availability') && (
              // Nachgeladen (siehe oben), mit derselben Absicherung wie die
              // Rechtstexte: scheitert der Chunk, bleibt die App bedienbar.
              <ErrorBoundary key={view} fallback={() => <PageErrorFallback />}>
                <Suspense fallback={<PageSkeleton />}>
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
                </Suspense>
              </ErrorBoundary>
            )}

            {(view === 'impressum' || view === 'datenschutz') && (
              // Nachgeladen (siehe oben). Scheitert der Chunk, bleibt die App
              // drumherum bedienbar, statt ganz in den Fehler zu fallen.
              <div className={styles.textPage}>
                <ErrorBoundary key={view} fallback={() => <PageErrorFallback />}>
                  <Suspense fallback={<LegalPageSkeleton />}>
                    {view === 'impressum' ? <ImpressumView /> : <DatenschutzView />}
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}

            {view === 'compare' && (
              <Suspense
                fallback={
                  <LayoutCard>
                    <SectionCardsSkeleton count={2} />
                  </LayoutCard>
                }
              >
                <CompareView
                  left={comparePair.left}
                  right={comparePair.right}
                  onCompare={handleCompare}
                  onOpenReport={handleOpenReport}
                />
              </Suspense>
            )}

            {/* Startseite: Wortmarke, Frage, große Suche, darunter Beispiele
                oder zuletzt Geprüftes, „Was diggy prüft“ und der Converter. */}
            {showHome && (
              <div className={styles.hero}>
                <span className={styles.heroWordmark} aria-hidden="true">
                  diggy
                </span>
                <Heading level={1} size="xl" wrap="balance" className={styles.heroTitle}>
                  {t('Was steckt hinter deiner Domain?')}
                </Heading>
                <Text elementType="p" align="center" wrap="balance">
                  {t('DNS, SSL, Mail-Security und Propagation auf einen Blick.')}{' '}
                  {t('Ohne Fachchinesisch, mit Empfehlungen.')}
                </Text>
              </div>
            )}

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

            {showHome && (
              <div className={styles.homeSections}>
                <CheckOverview />
                <ConverterPromo />
              </div>
            )}

            {/* Ladezustand — nur bis die Records da sind. Danach übernimmt der
                Report mit Skeletons für die noch ladenden Sektionen.
                role="status", damit der Text angesagt wird. */}
            {view === 'lookup' && recordsLoading && (
              <div role="status" className={styles.loading}>
                <LoadingSpinner size="l" />
                <Text>{t('Records werden geholt…')}</Text>
              </div>
            )}

            {/* IP-Adresse → Reverse-DNS/PTR-Ansicht */}
            {view === 'lookup' && ipQuery && !recordsLoading && <IpResultView ip={ipQuery} />}

            {/* Fehler */}
            {view === 'lookup' && recordsErrored && (
              <div className={styles.narrow}>
                <LayoutCard>
                  <SectionError error={lookup.recordsError} />
                </LayoutCard>
              </div>
            )}

            {/* Report */}
            {showReport && report && (
              <div key={report.domain + report.timestamp} className={styles.report}>
                {/* Ab 1440 px zwei Spalten: links die Zusammenfassung, die beim
                    Scrollen mitläuft, rechts die Tabs. Darunter ist die rechte
                    Spalte zu schmal für die Tab-Leiste — dort wird gestapelt
                    (App.module.css). */}
                <aside aria-label={t('Zusammenfassung')} className={styles.summary}>
                  {/* Report-Kopf: was geprüft wurde, wann, und was man damit tun kann. */}
                  <div className={styles.reportHead}>
                    <div className={styles.reportTitle}>
                      <Text className="eyebrow">{t('DNS-Report')}</Text>
                      <Heading level={1} className={`mono ${styles.domain}`}>
                        {report.domain}
                      </Heading>
                      <Text>
                        <small>{t('Geprüft am {date}', { date: formatCheckedAt(report.timestamp) })}</small>
                      </Text>
                    </div>
                    {/* Kurze Beschriftungen, damit die drei Aktionen in der
                        Seitenspalte und auf dem Handy in eine Zeile passen. Die
                        ausführliche Fassung steht ergänzend im Tooltip. */}
                    <div className={styles.reportActions}>
                      <TooltipTrigger delay="long">
                        <Button
                          size="s"
                          variant="soft"
                          color="secondary"
                          onPress={handleExportJson}
                          aria-label={t('JSON herunterladen')}
                        >
                          <IconDownload />
                          <Text>JSON</Text>
                        </Button>
                        <Tooltip>{t('Report als JSON herunterladen')}</Tooltip>
                      </TooltipTrigger>
                      <TooltipTrigger delay="long">
                        <Button size="s" variant="soft" color="secondary" onPress={handleCopyPermalink}>
                          {permalinkCopied ? <IconCheck /> : <IconLink />}
                          <Text>{permalinkCopied ? t('Link kopiert') : t('Link kopieren')}</Text>
                        </Button>
                        <Tooltip>{t('Permalink zu diesem Report kopieren')}</Tooltip>
                      </TooltipTrigger>
                      <TooltipTrigger delay="long">
                        <Button
                          size="s"
                          variant="soft"
                          color="secondary"
                          onPress={() => handleCompare(report.domain)}
                        >
                          <Icon>
                            <IconArrowsLeftRight />
                          </Icon>
                          <Text>{t('Vergleichen')}</Text>
                        </Button>
                        <Tooltip>{t('Mit einer zweiten Domain vergleichen')}</Tooltip>
                      </TooltipTrigger>
                    </div>
                  </div>

                  {/* Score + Schnellübersicht */}
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

                <div className={styles.details}>
                  {/* Über den Tabs statt in der Seitenspalte: die soll flach
                      bleiben (docs/DESIGN.md), und hier ist Platz für die Liste.
                      Beim ersten Lookup einer Domain gibt es nichts zu zeigen. */}
                  {previousCheck && (
                    // Eigene Boundary: scheitert das Nachladen (alter Chunk nach
                    // einem Deploy) oder der Vergleich an kaputten History-Daten,
                    // fehlt nur diese Karte — nicht der ganze Report.
                    <ErrorBoundary key={report.timestamp} fallback={() => null}>
                      <Suspense fallback={<SinceLastCheckSkeleton />}>
                        <SinceLastCheck
                          previous={previousCheck}
                          report={report}
                          failed={lookup.failed}
                          settled={lookup.allSettled}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}

                  <div ref={tabsRef} className={styles.tabsAnchor}>
                    <LayoutCard>
                      <Tabs
                        aria-label={t('Report-Bereiche')}
                        selectedKey={activeTab}
                        onSelectionChange={(key) => setActiveTab(key as TabId)}
                      >
                        <Tab id="records">
                          <TabTitle>
                            Records
                            <TabCount count={report.records.length} />
                          </TabTitle>
                          {tabContent(
                            'records',
                            // key pro Domain: RecordsList und PropagationView halten
                            // lokalen Filter-/Typ-State. Ohne Remount blieb der über
                            // einen Domain-Wechsel hinweg stehen.
                            <RecordsList
                              key={report.domain}
                              records={report.records}
                              onUseDomain={handleUseDomainInSearch}
                            />
                          )}
                        </Tab>
                        <Tab id="propagation">
                          <TabTitle>
                            Propagation
                            <TabCount count={propagation.data?.length || undefined} />
                          </TabTitle>
                          {tabContent(
                            'propagation',
                            propagation.status === 'loading' ? (
                              <PropagationSkeleton />
                            ) : propagation.status === 'error' ? (
                              <SectionError error={propagation.error} />
                            ) : propagation.data && propagation.data.length > 0 ? (
                              <Suspense fallback={<PropagationSkeleton />}>
                                <PropagationView
                                  key={report.domain}
                                  domain={report.domain}
                                  results={propagation.data}
                                  types={propagationTypes(report.domain)}
                                  type={shownPropagationType ?? propagationTypes(report.domain)[0]}
                                  onTypeChange={handlePropagationType}
                                  expected={propagationExpected}
                                  onExpectedChange={setPropagationExpected}
                                />
                              </Suspense>
                            ) : (
                              <Placeholder
                                title={t('Multi-Resolver-Propagation')}
                                subtitle={t('Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen.')}
                              />
                            )
                          )}
                        </Tab>
                        <Tab id="security">
                          <TabTitle>Security</TabTitle>
                          {tabContent(
                            'security',
                            securityLoading ? (
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
                            )
                          )}
                        </Tab>
                        <Tab id="mail">
                          <TabTitle>
                            Mail
                            <TabCount count={mailCount} />
                          </TabTitle>
                          {tabContent(
                            'mail',
                            mail.status === 'loading' ? (
                              <SectionCardsSkeleton count={4} />
                            ) : mail.status === 'error' ? (
                              <SectionError error={mail.error} />
                            ) : mailData ? (
                              <Suspense fallback={<SectionCardsSkeleton count={4} />}>
                                <MailView mail={mailData} />
                              </Suspense>
                            ) : (
                              <SectionCardsSkeleton count={4} />
                            )
                          )}
                        </Tab>
                        <Tab id="findings">
                          <TabTitle>
                            Findings
                            <TabCount count={lookup.allSettled ? lookup.findings.length : undefined} />
                          </TabTitle>
                          {tabContent(
                            'findings',
                            lookup.allSettled ? <FindingsList findings={lookup.findings} /> : <ListSkeleton rows={5} />
                          )}
                        </Tab>
                        <Tab id="whois">
                          <TabTitle>
                            WHOIS
                            <TabCount count={whois.status === 'done' && whois.data ? 1 : undefined} />
                          </TabTitle>
                          {tabContent(
                            'whois',
                            whois.status === 'loading' ? (
                              <WhoisSkeleton />
                            ) : whois.status === 'error' ? (
                              <SectionError error={whois.error} />
                            ) : (
                              <WhoisView
                                domain={report.domain}
                                whois={whois.data ?? undefined}
                                onUseDomain={handleUseDomainInSearch}
                              />
                            )
                          )}
                        </Tab>
                        {/* Bei DNS-Einträgen wie `_dmarc.example.com` hätten Speed und
                            Virus Scan (brauchen eine Website) nichts zu zeigen. */}
                        {!dnsOnly && (
                          <Tab id="speed">
                            <TabTitle>
                              Speed
                              <TabCount count={pageSpeed ? 1 : undefined} />
                            </TabTitle>
                            {tabContent(
                              'speed',
                              <Suspense fallback={<SectionCardsSkeleton count={2} />}>
                                <PageSpeedView
                                  data={pageSpeed}
                                  loading={pageSpeedLoading}
                                  error={
                                    pageSpeedError == null
                                      ? null
                                      : errorText(pageSpeedError, 'PageSpeed fehlgeschlagen')
                                  }
                                  strategy={pageSpeedStrategy}
                                  onStrategyChange={setPageSpeedStrategy}
                                  onRun={handleRunPageSpeed}
                                />
                              </Suspense>
                            )}
                          </Tab>
                        )}
                        {!dnsOnly && (
                          <Tab id="virusscan">
                            <TabTitle>
                              Virus Scan
                              <TabCount
                                count={
                                  virusScan
                                    ? (virusScan.stats.malicious + virusScan.stats.suspicious) || undefined
                                    : undefined
                                }
                              />
                            </TabTitle>
                            {tabContent(
                              'virusscan',
                              <Suspense fallback={<SectionCardsSkeleton count={2} />}>
                                <VirusScanView
                                  data={virusScan}
                                  loading={virusScanLoading}
                                  error={
                                    virusScanError == null
                                      ? null
                                      : errorText(virusScanError, 'VirusTotal-Scan fehlgeschlagen')
                                  }
                                  onRun={handleRunVirusScan}
                                />
                              </Suspense>
                            )}
                          </Tab>
                        )}
                      </Tabs>
                    </LayoutCard>
                  </div>
                </div>
              </div>
            )}
          </main>

          <footer className={styles.footer}>
            <Text>
              <small>diggy · DNS made friendly</small>
            </Text>
            {/* Unterstrichen wie Textlinks (Flow „inline“): Rechtliches soll
                auffindbar sein, aber nicht wie die Navigation oben wirken. */}
            <nav aria-label={t('Rechtliches')} className={styles.footerLinks}>
              <Link href="/impressum" size="s" color="dark" inline>
                {t('Impressum')}
              </Link>
              <Link href="/datenschutz" size="s" color="dark" inline>
                {t('Datenschutz')}
              </Link>
            </nav>
            <Text>
              <small>{buildLabel()}</small>
            </Text>
          </footer>
        </div>
      </RouterProvider>
    </I18nProvider>
  );
}

/** Anzahl hinter dem Tab-Titel — nur, wenn es etwas zu zählen gibt. */
function TabCount({ count }: { count?: number }) {
  if (count === undefined) return null;
  return <CounterBadge count={count} />;
}

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return <EmptyState title={title}>{subtitle}</EmptyState>;
}

function SectionError({ error }: { error?: unknown }) {
  useI18n();
  return (
    <EmptyState tone="danger" icon={<IconDanger />}>
      {errorText(error, 'Dieser Check ist fehlgeschlagen.')}
    </EmptyState>
  );
}

function formatCheckedAt(timestamp: string): string {
  return formatDate(timestamp, { dateStyle: 'medium', timeStyle: 'short' });
}

function getLookupUrl(
  domain: string,
  propagationType: PropagationRecordType | null,
  expected: string
): string {
  return `${window.location.origin}${lookupPathFor(domain, propagationType, expected)}`;
}

/** Pause nach dem letzten Tastendruck im Feld „erwarteter Wert“, bevor der Link nachzieht. */
const EXPECTED_LINK_DELAY_MS = 300;

/**
 * replaceState für den Link der Ansicht. Der Link ist Komfort: Lehnt der
 * Browser ab (Safari bei zu vielen Aufrufen), bleibt die Ansicht stehen —
 * der nächste Stand schreibt ihn wieder.
 */
function replaceHistoryPath(path: string): void {
  try {
    window.history.replaceState(null, '', path);
  } catch {
    // SecurityError: zu viele Aufrufe in kurzer Zeit.
  }
}

function replaceLookupPath(domain: string): void {
  const nextPath = lookupPathFor(domain);
  if (window.location.pathname === nextPath) return;
  window.history.replaceState(null, '', nextPath);
}
