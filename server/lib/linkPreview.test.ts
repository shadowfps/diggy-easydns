import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createIndexRenderer,
  domainFromLookupPath,
  escapeHtml,
  lookupPreview,
  previewOrigin,
  renderPreviewTags,
} from './linkPreview.js';

const INDEX_HTML = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');

/** Inhalt aller Inline-Scripts — genau das, woraus die CSP ihre Hashes bildet. */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

function metaContent(html: string, attr: 'name' | 'property', key: string): string | undefined {
  const pattern = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)" />`);
  return pattern.exec(html)?.[1];
}

describe('escapeHtml', () => {
  it('escaped alle Zeichen, die aus einem Attribut oder Text ausbrechen könnten', () => {
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
    expect(escapeHtml('"><script>alert(1)</script>')).toBe(
      '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('lässt harmlosen Text unverändert', () => {
    expect(escapeHtml('example.com — diggy')).toBe('example.com — diggy');
  });
});

describe('domainFromLookupPath', () => {
  it('liest die Domain aus einem Permalink und normalisiert sie wie die API', () => {
    expect(domainFromLookupPath('/lookup/example.com')).toBe('example.com');
    expect(domainFromLookupPath('/lookup/Example.COM/')).toBe('example.com');
    expect(domainFromLookupPath('/LOOKUP/example.com')).toBe('example.com');
    expect(domainFromLookupPath('/lookup/example.com.')).toBe('example.com');
    expect(domainFromLookupPath('/lookup/https%3A%2F%2Fexample.com%2Fpfad')).toBe('example.com');
    expect(domainFromLookupPath('/lookup/_dmarc.example.com')).toBe('_dmarc.example.com');
  });

  it('wandelt IDN in Punycode — dieselbe Form, die die Seite zeigt', () => {
    expect(domainFromLookupPath('/lookup/m%C3%BCnsterland.it')).toBe('xn--mnsterland-9db.it');
  });

  it('lehnt alles ab, was keine gültige Domain ergibt', () => {
    expect(domainFromLookupPath('/lookup/%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')).toBeNull();
    expect(domainFromLookupPath('/lookup/x%22onmouseover%3D%22alert(1).com')).toBeNull();
    expect(domainFromLookupPath('/lookup/localhost')).toBeNull();
    expect(domainFromLookupPath('/lookup/%')).toBeNull(); // decodeURIComponent wirft
    expect(domainFromLookupPath('/lookup/')).toBeNull();
  });

  it('greift nur für genau /lookup/<domain>', () => {
    expect(domainFromLookupPath('/')).toBeNull();
    expect(domainFromLookupPath('/impressum')).toBeNull();
    expect(domainFromLookupPath('/lookup/example.com/mehr')).toBeNull();
    expect(domainFromLookupPath('/x/lookup/example.com')).toBeNull();
  });
});

describe('lookupPreview', () => {
  it('nennt die Domain in Titel, Beschreibung und absoluter URL', () => {
    expect(lookupPreview('example.com', 'https://diggy.example')).toEqual({
      title: 'example.com — diggy',
      description: 'DNS, Mail-Schutz, SSL und Propagation von example.com auf einen Blick.',
      url: 'https://diggy.example/lookup/example.com',
      image: 'https://diggy.example/og-image.png',
    });
  });

  it('verspricht bei DNS-Einträgen kein SSL und keine Propagation', () => {
    const { description } = lookupPreview('_dmarc.example.com', 'https://diggy.example');
    expect(description).toBe('DNS-Einträge, Mail-Schutz und DNSSEC zu _dmarc.example.com auf einen Blick.');
  });

  it('lässt URL und Bild weg, wenn keine Basis bekannt ist', () => {
    const meta = lookupPreview('example.com', null);
    expect(meta.url).toBeUndefined();
    expect(meta.image).toBeUndefined();
  });
});

describe('renderPreviewTags', () => {
  it('escaped jeden Wert im Attribut- und Text-Kontext', () => {
    const html = renderPreviewTags({
      title: '"><script>alert(1)</script>',
      description: `a'b"c<d>e&f`,
      url: 'https://x.example/"onload="alert(1)',
      image: 'https://x.example/<img>',
    });

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('"onload=');
    expect(html).toContain('<title>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>');
    expect(html).toContain('content="a&#39;b&quot;c&lt;d&gt;e&amp;f"');
    expect(html).toContain('content="https://x.example/&lt;img&gt;"');
  });

  it('nimmt ohne Bild die kleine Twitter-Karte', () => {
    const html = renderPreviewTags(lookupPreview('example.com', null));
    expect(metaContent(html, 'name', 'twitter:card')).toBe('summary');
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('og:url');
  });
});

describe('createIndexRenderer', () => {
  const render = createIndexRenderer(INDEX_HTML);
  const html = render?.(lookupPreview('example.com', 'https://diggy.example')) ?? '';

  it('setzt die Tags für die Domain ins index.html', () => {
    expect(render).not.toBeNull();
    expect(html).toContain('<title>example.com — diggy</title>');
    expect(metaContent(html, 'property', 'og:title')).toBe('example.com — diggy');
    expect(metaContent(html, 'property', 'og:description')).toBe(
      'DNS, Mail-Schutz, SSL und Propagation von example.com auf einen Blick.'
    );
    expect(metaContent(html, 'property', 'og:url')).toBe('https://diggy.example/lookup/example.com');
    expect(metaContent(html, 'property', 'og:image')).toBe('https://diggy.example/og-image.png');
    expect(metaContent(html, 'property', 'og:type')).toBe('website');
    expect(metaContent(html, 'property', 'og:site_name')).toBe('diggy');
    expect(metaContent(html, 'name', 'twitter:card')).toBe('summary_large_image');
  });

  it('ersetzt Titel und Beschreibung, statt sie zu verdoppeln', () => {
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
    expect(html).not.toContain('DNS made friendly</title>');
    expect(html).not.toContain('Comprehensive DNS, SSL');
  });

  it('lässt Inline-Scripts Byte für Byte stehen — der CSP-Hash bleibt gültig', () => {
    const original = inlineScripts(INDEX_HTML);
    expect(original.length).toBeGreaterThan(0);
    expect(inlineScripts(html)).toEqual(original);
  });

  it('lässt den Rest des Dokuments unverändert', () => {
    // Neuen Block gegen den alten Titel tauschen, alte Beschreibung streichen:
    // dann muss Zeichen für Zeichen das Original herauskommen.
    const tags = renderPreviewTags(lookupPreview('example.com', 'https://diggy.example'));
    const originalTitle = /<title>[\s\S]*?<\/title>/.exec(INDEX_HTML)?.[0] ?? '';
    const withoutDescription = INDEX_HTML.replace(/[ \t]*<meta name="description"[^>]*>\n/, '');

    expect(withoutDescription).not.toBe(INDEX_HTML);
    expect(html.replace(tags, originalTitle)).toBe(withoutDescription);
  });

  it('fügt die Tags vor </head> ein, wenn es keinen <title> gibt', () => {
    const renderer = createIndexRenderer('<html><head><meta charset="utf-8"></head><body></body></html>');
    expect(renderer?.(lookupPreview('example.com', null))).toMatch(
      /<meta charset="utf-8"><title>example\.com — diggy<\/title>[\s\S]*<\/head>/
    );
  });

  it('gibt ohne <head> null zurück — dann bleibt index.html unverändert', () => {
    expect(createIndexRenderer('<p>kein Dokument</p>')).toBeNull();
  });
});

describe('previewOrigin', () => {
  function makeApp(configured: string | undefined, trustProxy = false) {
    const app = express();
    if (trustProxy) app.set('trust proxy', 1);
    app.get('/origin', (req, res) => {
      res.json({ origin: previewOrigin(req, configured) });
    });
    return app;
  }

  it('nimmt die konfigurierte PUBLIC_ORIGIN, egal welcher Host anfragt', async () => {
    const res = await request(makeApp('https://diggydns.cloud'))
      .get('/origin')
      .set('Host', 'anderer.example');
    expect(res.body.origin).toBe('https://diggydns.cloud');
  });

  it('fällt ohne Konfiguration auf den Host des Requests zurück', async () => {
    const res = await request(makeApp(undefined)).get('/origin').set('Host', 'Diggy.Example:3281');
    expect(res.body.origin).toBe('http://diggy.example:3281');
  });

  it('übernimmt Host und Protokoll vom Proxy nur bei trust proxy', async () => {
    const proxied = await request(makeApp(undefined, true))
      .get('/origin')
      .set('Host', 'intern:3001')
      .set('X-Forwarded-Host', 'diggy.example')
      .set('X-Forwarded-Proto', 'https');
    expect(proxied.body.origin).toBe('https://diggy.example');

    const direct = await request(makeApp(undefined))
      .get('/origin')
      .set('Host', 'intern:3001')
      .set('X-Forwarded-Host', 'boese.example')
      .set('X-Forwarded-Proto', 'https');
    expect(direct.body.origin).toBe('http://intern:3001');
  });

  it('spiegelt keinen Host, der nicht wie einer aussieht', async () => {
    const res = await request(makeApp(undefined, true))
      .get('/origin')
      .set('X-Forwarded-Host', 'x"><script>alert(1)</script>');
    expect(res.body.origin).toBeNull();

    const tooLong = await request(makeApp(undefined))
      .get('/origin')
      .set('Host', `${'a'.repeat(300)}.example`);
    expect(tooLong.body.origin).toBeNull();
  });

  it('spiegelt kein Protokoll außer http und https', async () => {
    for (const proto of ['javascript', 'ftp', '"><script>alert(1)</script>']) {
      const res = await request(makeApp(undefined, true))
        .get('/origin')
        .set('Host', 'diggy.example')
        .set('X-Forwarded-Proto', proto);
      expect(res.body.origin).toBeNull();
    }
  });
});
