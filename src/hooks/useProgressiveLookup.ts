import { useCallback, useMemo, useReducer, useRef } from 'react';
import {
  lookupRecords,
  lookupPropagation,
  lookupDnssec,
  lookupSsl,
  lookupMail,
  lookupWhois,
  lookupTechStack,
  type LookupCore,
} from '@/lib/api';
import { calculateScore } from '@/lib/scoring';
import { isDnsOnlyName } from '@/lib/dnsName';
import type {
  DetectedTech,
  DnsRecord,
  DnssecInfo,
  Finding,
  HealthScore,
  LookupReport,
  MailSecurity,
  RecordType,
  ResolverResult,
  SslInfo,
  WhoisInfo,
} from '@/types/dns';

/* ─── Öffentliche Typen ────────────────────────────────────────────────── */

/** `skipped`: für diesen Namen nicht anwendbar, wird gar nicht erst geladen. */
export type LoadStatus = 'idle' | 'loading' | 'done' | 'error' | 'skipped';

export interface SectionSlice<T> {
  status: LoadStatus;
  data: T | undefined;
  error?: string;
}

export type SectionKey = 'propagation' | 'dnssec' | 'ssl' | 'mail' | 'whois' | 'techStack';

export interface TypedSections {
  propagation: SectionSlice<ResolverResult[]>;
  dnssec: SectionSlice<DnssecInfo>;
  ssl: SectionSlice<SslInfo | null>;
  mail: SectionSlice<MailSecurity>;
  whois: SectionSlice<WhoisInfo | null>;
  techStack: SectionSlice<DetectedTech[]>;
}

export const SECTION_KEYS: readonly SectionKey[] = [
  'propagation',
  'dnssec',
  'ssl',
  'mail',
  'whois',
  'techStack',
];

/**
 * Was bei einem DNS-Eintrag wie `s1._domainkey.example.com` wegfällt (siehe
 * isDnsOnlyName): SSL und Tech-Stack bräuchten einen Webserver, die
 * Propagation vergleicht A/AAAA-Records. DNSSEC, Mail und WHOIS laufen auf
 * der Apex-Domain und bleiben.
 */
const HOST_SECTIONS: SectionKey[] = ['propagation', 'ssl', 'techStack'];

const DEFAULT_MAIL: MailSecurity = {
  spf: { present: false, valid: false, issues: [] },
  dmarc: { present: false },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: false,
  nullMx: false,
};

const DEFAULT_DNSSEC: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

/* ─── Reducer-State ────────────────────────────────────────────────────── */

interface State {
  seq: number;
  domain: string | null;
  timestamp: string | null;
  records: DnsRecord[] | null;
  failedRecordTypes: RecordType[] | undefined;
  recordsStatus: LoadStatus;
  recordsError: string | null;
  dnsFindings: Finding[];
  sections: Record<SectionKey, SectionSlice<unknown>>;
  sectionFindings: Partial<Record<SectionKey, Finding[]>>;
}

function makeSections(
  status: LoadStatus,
  skipped: readonly SectionKey[] = []
): Record<SectionKey, SectionSlice<unknown>> {
  return SECTION_KEYS.reduce((acc, key) => {
    acc[key] = { status: skipped.includes(key) ? 'skipped' : status, data: undefined };
    return acc;
  }, {} as Record<SectionKey, SectionSlice<unknown>>);
}

const INITIAL: State = {
  seq: 0,
  domain: null,
  timestamp: null,
  records: null,
  failedRecordTypes: undefined,
  recordsStatus: 'idle',
  recordsError: null,
  dnsFindings: [],
  sections: makeSections('idle'),
  sectionFindings: {},
};

type Action =
  | { type: 'reset' }
  | { type: 'start'; seq: number; domain: string; skipped: readonly SectionKey[] }
  | { type: 'recordsDone'; seq: number; core: LookupCore }
  | { type: 'recordsError'; seq: number; message: string }
  | { type: 'sectionDone'; seq: number; key: SectionKey; data: unknown; findings: Finding[] }
  | { type: 'sectionError'; seq: number; key: SectionKey; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return INITIAL;
    case 'start':
      return {
        ...INITIAL,
        seq: action.seq,
        domain: action.domain,
        recordsStatus: 'loading',
        sections: makeSections('loading', action.skipped),
      };
    case 'recordsDone':
      if (action.seq !== state.seq) return state;
      return {
        ...state,
        records: action.core.records,
        failedRecordTypes: action.core.failedRecordTypes,
        domain: action.core.domain,
        timestamp: action.core.timestamp,
        dnsFindings: action.core.findings,
        recordsStatus: 'done',
      };
    case 'recordsError':
      if (action.seq !== state.seq) return state;
      return { ...state, recordsStatus: 'error', recordsError: action.message };
    case 'sectionDone':
      if (action.seq !== state.seq) return state;
      return {
        ...state,
        sections: { ...state.sections, [action.key]: { status: 'done', data: action.data } },
        sectionFindings: { ...state.sectionFindings, [action.key]: action.findings },
      };
    case 'sectionError':
      if (action.seq !== state.seq) return state;
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.key]: { status: 'error', data: undefined, error: action.message },
        },
      };
    default:
      return state;
  }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Fehlgeschlagen';
}

/* ─── Hook ─────────────────────────────────────────────────────────────── */

export interface ProgressiveLookup {
  domain: string | null;
  records: DnsRecord[] | null;
  recordsStatus: LoadStatus;
  recordsError: string | null;
  sections: TypedSections;
  findings: Finding[];
  healthScore: HealthScore;
  /** true, sobald Records + alle Sektionen fertig (done, error oder skipped) sind. */
  allSettled: boolean;
  /** Progressiv befüllter Report — für History/Export, sobald Records da sind. */
  report: LookupReport | null;
  /**
   * Sektionen, deren Abfrage fehlschlug. Im `report` stehen für sie Defaults
   * (DMARC fehlt, DNSSEC aus) — die History muss das wissen, sonst hält der
   * nächste Vergleich einen Timeout für eine echte Änderung. Teilausfälle
   * innerhalb einer Sektion trägt der Report selbst (`lookupFailed`,
   * `failedRecordTypes`).
   */
  failed: readonly SectionKey[];
  run: (domain: string) => void;
  reset: () => void;
}

export function useProgressiveLookup(): ProgressiveLookup {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  // Sequenz-Guard: nur Antworten des zuletzt gestarteten Lookups zählen.
  const seqRef = useRef(0);

  const run = useCallback((rawDomain: string) => {
    const domain = rawDomain.trim().toLowerCase();
    if (!domain) return;
    const seq = ++seqRef.current;
    const skipped = isDnsOnlyName(domain) ? HOST_SECTIONS : [];
    dispatch({ type: 'start', seq, domain, skipped });

    lookupRecords(domain)
      .then((core) => {
        if (seq !== seqRef.current) return;
        dispatch({ type: 'recordsDone', seq, core });

        // Server-normalisierte Domain (IDN → Punycode) für die Sektionen nutzen.
        const target = core.domain;

        // `request` als Funktion: übersprungene Sektionen sollen gar keinen
        // Request auslösen, nicht nur ihr Ergebnis verwerfen.
        const fire = <R,>(
          key: SectionKey,
          request: () => Promise<R>,
          pick: (r: R) => { data: unknown; findings: Finding[] }
        ) => {
          if (skipped.includes(key)) return;
          request()
            .then((r) => {
              if (seq !== seqRef.current) return;
              const { data, findings } = pick(r);
              dispatch({ type: 'sectionDone', seq, key, data, findings });
            })
            .catch((e) => {
              if (seq !== seqRef.current) return;
              dispatch({ type: 'sectionError', seq, key, message: errMessage(e) });
            });
        };

        // Alle Sektionen PARALLEL — jede rendert, sobald sie fertig ist.
        fire('propagation', () => lookupPropagation(target), (r) => ({
          data: r.propagation,
          findings: r.findings,
        }));
        fire('dnssec', () => lookupDnssec(target), (r) => ({ data: r.dnssec, findings: r.findings }));
        fire('ssl', () => lookupSsl(target), (r) => ({ data: r.ssl, findings: r.findings }));
        fire('mail', () => lookupMail(target), (r) => ({ data: r.mail, findings: r.findings }));
        fire('whois', () => lookupWhois(target), (r) => ({ data: r.whois, findings: r.findings }));
        fire('techStack', () => lookupTechStack(target), (r) => ({ data: r.techStack, findings: [] }));
      })
      .catch((e) => {
        if (seq !== seqRef.current) return;
        dispatch({ type: 'recordsError', seq, message: errMessage(e) });
      });
  }, []);

  const reset = useCallback(() => {
    // In-flight-Antworten entwerten und State leeren.
    seqRef.current += 1;
    dispatch({ type: 'reset' });
  }, []);

  const findings = useMemo(() => {
    const all = [...state.dnsFindings];
    for (const key of SECTION_KEYS) {
      const fragment = state.sectionFindings[key];
      if (fragment) all.push(...fragment);
    }
    return all;
  }, [state.dnsFindings, state.sectionFindings]);

  const allSettled = useMemo(() => {
    if (state.recordsStatus !== 'done') return false;
    return SECTION_KEYS.every((k) => {
      const s = state.sections[k].status;
      return s === 'done' || s === 'error' || s === 'skipped';
    });
  }, [state.recordsStatus, state.sections]);

  const failed = useMemo(
    () => SECTION_KEYS.filter((k) => state.sections[k].status === 'error'),
    [state.sections]
  );

  const healthScore = useMemo(() => calculateScore(findings), [findings]);

  const sections = state.sections as unknown as TypedSections;

  const report = useMemo<LookupReport | null>(() => {
    if (state.recordsStatus !== 'done' || !state.records || !state.domain || !state.timestamp) {
      return null;
    }
    return {
      domain: state.domain,
      timestamp: state.timestamp,
      records: state.records,
      propagation: (sections.propagation.data as ResolverResult[] | undefined) ?? [],
      ssl: (sections.ssl.data as SslInfo | null | undefined) ?? undefined,
      dnssec: (sections.dnssec.data as DnssecInfo | undefined) ?? DEFAULT_DNSSEC,
      mail: (sections.mail.data as MailSecurity | undefined) ?? DEFAULT_MAIL,
      whois: (sections.whois.data as WhoisInfo | null | undefined) ?? undefined,
      findings,
      healthScore,
      techStack: (sections.techStack.data as DetectedTech[] | undefined) ?? [],
      failedRecordTypes: state.failedRecordTypes,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, findings, healthScore]);

  return {
    domain: state.domain,
    records: state.records,
    recordsStatus: state.recordsStatus,
    recordsError: state.recordsError,
    sections,
    findings,
    healthScore,
    allSettled,
    report,
    failed,
    run,
    reset,
  };
}
