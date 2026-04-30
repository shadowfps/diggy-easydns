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
import { Tabs, type TabId } from '@/components/ui/Tabs';
import { Loader2 } from 'lucide-react';
import SplitText from '@/components/ui/SplitText';
import TextType from '@/components/ui/TextType';
import ShinyText from '@/components/ui/ShinyText';
import { lookupDomain, lookupPageSpeed } from '@/lib/api';
import type { LookupReport, PageSpeedReport, PageSpeedStrategy } from '@/types/dns';

export default function App() {
  const [report, setReport] = useState<LookupReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageSpeed, setPageSpeed] = useState<PageSpeedReport | null>(null);
  const [pageSpeedLoading, setPageSpeedLoading] = useState(false);
  const [pageSpeedError, setPageSpeedError] = useState<string | null>(null);
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<PageSpeedStrategy>('mobile');
  const [activeTab, setActiveTab] = useState<TabId>('records');
  const reportRef = useRef<HTMLDivElement>(null);
  // Sequenz-Counter: nur das Ergebnis des zuletzt gestarteten Lookups
  // darf den State updaten — sonst überschreibt eine späte Antwort eine
  // frischere und der UI bleibt im falschen Zustand stehen.
  const lookupSeqRef = useRef(0);

  const handleSearch = async (domain: string) => {
    const seq = ++lookupSeqRef.current;
    // Vorherigen Report sofort wegräumen, damit es nie zwei Reports
    // gleichzeitig im DOM gibt (alte Antwort + neue Antwort untereinander).
    setReport(null);
    setError(null);
    setPageSpeed(null);
    setPageSpeedError(null);
    setPageSpeedLoading(false);
    setPageSpeedStrategy('mobile');
    setLoading(true);
    try {
      const result = await lookupDomain(domain);
      // Verzichte auf den State-Update, falls inzwischen ein neuer Lookup
      // gestartet wurde — wir wollen kein Flackern oder falsche Anzeige.
      if (seq !== lookupSeqRef.current) return;
      setReport(result);
      setActiveTab('records');
    } catch (e) {
      if (seq !== lookupSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Lookup fehlgeschlagen');
    } finally {
      if (seq === lookupSeqRef.current) setLoading(false);
    }
  };

  const handleRunPageSpeed = async () => {
    if (!report?.domain || pageSpeedLoading) return;
    setPageSpeedError(null);
    setPageSpeedLoading(true);
    try {
      const result = await lookupPageSpeed(report.domain, pageSpeedStrategy);
      setPageSpeed(result);
    } catch (e) {
      setPageSpeedError(e instanceof Error ? e.message : 'PageSpeed fehlgeschlagen');
    } finally {
      setPageSpeedLoading(false);
    }
  };

  // Wenn ein neuer Report erscheint: sanft hinscrollen, damit der Wechsel
  // sichtbar ist (sonst wirkt's auf langen Bildschirmen "nix passiert").
  useEffect(() => {
    if (report && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [report]);

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <Header />

      <main className="flex-1 px-6 md:px-8 py-12 md:py-20">
        {/* Hero / Search */}
        {/* Kein mode="wait" — sonst kann ein hängender Exit den nächsten
            Render blockieren. Da ein Loading-Zwischenstate sowieso die
            Lücke füllt, gibt es kein Overlap-Risiko. */}
        <AnimatePresence>
          {!report && !loading && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20, pointerEvents: 'none' }}
              className="text-center mb-10"
            >
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-5"
              >
                <ShinyText
                  text="diggy"
                  className="font-brand font-bold text-5xl md:text-7xl tracking-tight lowercase"
                  color="#920FED"
                  shineColor="#FFFFFF"
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
                  cursorClassName="text-diggy-500"
                  cursorBlinkDuration={0.6}
                  initialDelay={500}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <SearchBar onSearch={handleSearch} loading={loading} />

        {/* Loading State */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-12 text-center"
            >
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-diggy-500" />
              <p className="mt-3 text-sm text-ink-900/60 dark:text-ink-50/60">
                Records werden geholt…
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="mt-8 p-4 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Report */}
        {/* Kein mode="wait" — der Loading-State zwischen zwei Reports sorgt
            für eine saubere Lücke. Verschachteltes AnimatePresence-mode-wait
            (Tabs innen) kann sonst die Exit-Promise nicht resolven und
            den ganzen Block hängen lassen. */}
        <AnimatePresence>
          {report && !loading && (
            <motion.div
              ref={reportRef}
              key={report.domain + report.timestamp}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, pointerEvents: 'none' }}
              transition={{ duration: 0.3 }}
              className="mt-10"
            >
              <div className="text-center mb-8">
                <span className="font-mono text-base text-ink-900/60 dark:text-ink-50/60">
                  {report.domain}
                </span>
              </div>

              {/* Score + Quick Facts */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <ScoreCard score={report.healthScore} />
                <QuickFacts report={report} />
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
                    count: report.propagation.length || undefined,
                  },
                  { id: 'security', label: 'Security' },
                  {
                    id: 'mail',
                    label: 'Mail',
                    count:
                      (report.mail.spf.present ? 1 : 0) +
                      (report.mail.dmarc.present ? 1 : 0) +
                      report.mail.dkim.selectors.length +
                      (report.mail.mtaSts.present ? 1 : 0) || undefined,
                  },
                  { id: 'findings', label: 'Findings', count: report.findings.length },
                  { id: 'whois', label: 'WHOIS', count: report.whois ? 1 : undefined },
                  { id: 'speed', label: 'Speed', count: pageSpeed ? 1 : undefined },
                ]}
              />

              <div className="mt-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === 'records' && <RecordsList records={report.records} />}
                    {activeTab === 'propagation' && (
                      report.propagation.length > 0
                        ? <PropagationView results={report.propagation} />
                        : <Placeholder title="Multi-Resolver-Propagation" subtitle="Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen." />
                    )}
                    {activeTab === 'findings' && <FindingsList findings={report.findings} />}
                    {activeTab === 'security' && (
                      <SecurityView ssl={report.ssl} dnssec={report.dnssec} />
                    )}
                    {activeTab === 'mail' && <MailView mail={report.mail} />}
                    {activeTab === 'whois' && <WhoisView whois={report.whois} />}
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
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer-Actions */}
              <div className="mt-12 flex justify-end gap-2">
                <ActionButton>Export JSON</ActionButton>
                <ActionButton>Permalink kopieren</ActionButton>
                <ActionButton>Watch 🔔</ActionButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="px-6 md:px-8 py-8 border-t border-ink-100 dark:border-ink-900">
        <div className="flex items-center justify-between text-xs text-ink-900/40 dark:text-ink-50/40">
          <span>diggy · DNS made friendly</span>
          <span>v0.1.0</span>
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

function ActionButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="px-3.5 py-2 text-xs font-medium rounded-lg border border-ink-100 dark:border-ink-900/80 hover:bg-ink-100/60 dark:hover:bg-ink-900 transition-colors">
      {children}
    </button>
  );
}
