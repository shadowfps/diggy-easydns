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
import type {
  DetectedTech,
  DnsRecord,
  DnssecInfo,
  Finding,
  HealthScore,
  LookupReport,
  MailSecurity,
  ResolverResult,
  SslInfo,
  WhoisInfo,
} from '@/types/dns';

/* ─── Öffentliche Typen ────────────────────────────────────────────────── */

export type LoadStatus = 'idle' | 'loading' | 'done' | 'error';

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

const SECTION_KEYS: SectionKey[] = ['propagation', 'dnssec', 'ssl', 'mail', 'whois', 'techStack'];

const DEFAULT_MAIL: MailSecurity = {
  spf: { present: false, valid: false, issues: [] },
  dmarc: { present: false },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: false,
};

const DEFAULT_DNSSEC: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

/* ─── Reducer-State ────────────────────────────────────────────────────── */

interface State {
  seq: number;
  domain: string | null;
  timestamp: string | null;
  records: DnsRecord[] | null;
  recordsStatus: LoadStatus;
  recordsError: string | null;
  dnsFindings: Finding[];
  sections: Record<SectionKey, SectionSlice<unknown>>;
  sectionFindings: Partial<Record<SectionKey, Finding[]>>;
}

function makeSections(status: LoadStatus): Record<SectionKey, SectionSlice<unknown>> {
  return SECTION_KEYS.reduce((acc, key) => {
    acc[key] = { status, data: undefined };
    return acc;
  }, {} as Record<SectionKey, SectionSlice<unknown>>);
}

const INITIAL: State = {
  seq: 0,
  domain: null,
  timestamp: null,
  records: null,
  recordsStatus: 'idle',
  recordsError: null,
  dnsFindings: [],
  sections: makeSections('idle'),
  sectionFindings: {},
};

type Action =
  | { type: 'reset' }
  | { type: 'start'; seq: number; domain: string }
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
        sections: makeSections('loading'),
      };
    case 'recordsDone':
      if (action.seq !== state.seq) return state;
      return {
        ...state,
        records: action.core.records,
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
  /** true, sobald Records + alle Sektionen fertig (done oder error) sind. */
  allSettled: boolean;
  /** Progressiv befüllter Report — für History/Export, sobald Records da sind. */
  report: LookupReport | null;
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
    dispatch({ type: 'start', seq, domain });

    lookupRecords(domain)
      .then((core) => {
        if (seq !== seqRef.current) return;
        dispatch({ type: 'recordsDone', seq, core });

        // Server-normalisierte Domain (IDN → Punycode) für die Sektionen nutzen.
        const target = core.domain;

        const fire = <R,>(
          key: SectionKey,
          request: Promise<R>,
          pick: (r: R) => { data: unknown; findings: Finding[] }
        ) => {
          request
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
        fire('propagation', lookupPropagation(target), (r) => ({
          data: r.propagation,
          findings: r.findings,
        }));
        fire('dnssec', lookupDnssec(target), (r) => ({ data: r.dnssec, findings: r.findings }));
        fire('ssl', lookupSsl(target), (r) => ({ data: r.ssl, findings: r.findings }));
        fire('mail', lookupMail(target), (r) => ({ data: r.mail, findings: r.findings }));
        fire('whois', lookupWhois(target), (r) => ({ data: r.whois, findings: r.findings }));
        fire('techStack', lookupTechStack(target), (r) => ({ data: r.techStack, findings: [] }));
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
      return s === 'done' || s === 'error';
    });
  }, [state.recordsStatus, state.sections]);

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
    run,
    reset,
  };
}
