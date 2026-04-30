import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { SearchBar } from '@/modules/search/SearchBar';
import { ScoreCard } from '@/modules/score/ScoreCard';
import { QuickFacts } from '@/modules/score/QuickFacts';
import { RecordsList } from '@/modules/records/RecordsList';
import { PropagationView } from '@/modules/propagation/PropagationView';
import { FindingsList } from '@/modules/findings/FindingsList';
import { Tabs, type TabId } from '@/components/ui/Tabs';
import { DiggyLogo } from '@/components/ui/DiggyLogo';
import { lookupDomain } from '@/lib/api';
import type { LookupReport } from '@/types/dns';

export default function App() {
  const [report, setReport] = useState<LookupReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('records');

  const handleSearch = async (domain: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await lookupDomain(domain);
      setReport(result);
      setActiveTab('records');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-12 md:py-20">
        {/* Hero / Search */}
        <AnimatePresence mode="wait">
          {!report && !loading && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center mb-10"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="inline-block mb-6"
              >
                <DiggyLogo className="w-16 h-16 mx-auto" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl md:text-5xl font-medium tracking-tight mb-3"
              >
                Was steckt hinter deiner Domain?
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-base text-ink-900/60 dark:text-ink-50/60 mb-10 max-w-md mx-auto"
              >
                DNS, SSL, Mail-Security und Propagation auf einen Blick. Ohne Fachchinesisch, mit Empfehlungen.
              </motion.p>
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
              <DiggyLogo className="w-12 h-12 mx-auto" animate />
              <p className="mt-3 text-sm text-ink-900/60 dark:text-ink-50/60">
                Diggy gräbt nach den Records...
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
        <AnimatePresence>
          {report && !loading && (
            <motion.div
              key={report.domain + report.timestamp}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
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
                  { id: 'mail', label: 'Mail' },
                  { id: 'findings', label: 'Findings', count: report.findings.length },
                  { id: 'whois', label: 'WHOIS' },
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
                        : <Placeholder title="Multi-Resolver-Propagation" subtitle="Vergleich gegen Google, Cloudflare, Quad9 & Co. — kommt als nächstes" />
                    )}
                    {activeTab === 'findings' && <FindingsList findings={report.findings} />}
                    {activeTab === 'security' && (
                      <Placeholder title="Security & SSL" subtitle="DNSSEC-Chain, Cert-Details, CAA, HSTS — kommt als nächstes" />
                    )}
                    {activeTab === 'mail' && (
                      <Placeholder title="Mail-Security" subtitle="SPF-Tree, DKIM-Selectors, DMARC-Policy — kommt als nächstes" />
                    )}
                    {activeTab === 'whois' && (
                      <Placeholder title="WHOIS / RDAP" subtitle="Registrar, Daten, Owner-Info — kommt als nächstes" />
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

      <footer className="max-w-6xl mx-auto px-6 py-8 border-t border-ink-100 dark:border-ink-900 mt-16">
        <div className="flex items-center justify-between text-xs text-ink-900/40 dark:text-ink-50/40">
          <span>Diggy · DNS made friendly</span>
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
