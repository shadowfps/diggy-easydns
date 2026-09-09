import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, type TabId } from './Tabs';

/**
 * Tabs waren zweimal Fundstelle: die ARIA-Semantik fehlte komplett (#24), und
 * die Scroll-Korrektur rechnete mit `offsetLeft` gegen den falschen Vorfahren.
 * Beides fand nur ein Review, kein Test.
 */

const TABS: { id: TabId; label: string; count?: number }[] = [
  { id: 'records', label: 'Records', count: 12 },
  { id: 'propagation', label: 'Propagation' },
  { id: 'security', label: 'Security' },
  { id: 'mail', label: 'Mail', count: 3 },
];

function setup(active: TabId = 'records') {
  const onChange = vi.fn();
  const view = render(<Tabs tabs={TABS} active={active} onChange={onChange} />);
  return { onChange, ...view };
}

describe('Tabs — ARIA-Semantik', () => {
  it('ist eine Tablist mit einem Tab pro Eintrag', () => {
    setup();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(TABS.length);
  });

  it('markiert genau den aktiven Tab per aria-selected', () => {
    setup('security');
    const selected = screen.getAllByRole('tab', { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Security');
  });

  /**
   * Die Leiste soll EIN Tab-Stop sein, nicht acht. Genau dafür ist das
   * Roving-Tabindex-Muster da.
   */
  it('hält nur den aktiven Tab im Tab-Fokus (Roving Tabindex)', () => {
    setup('mail');
    const tabs = screen.getAllByRole('tab');
    const focusable = tabs.filter((tab) => tab.getAttribute('tabindex') === '0');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveTextContent('Mail');
  });

  /**
   * Regression: aria-controls zeigte bei allen inaktiven Tabs auf eine ID, die
   * es im DOM nicht gibt — der Panel-Container ist auf den aktiven Tab gekeyt.
   */
  it('setzt aria-controls nur am aktiven Tab', () => {
    setup('records');
    const tabs = screen.getAllByRole('tab');
    const withControls = tabs.filter((tab) => tab.hasAttribute('aria-controls'));
    expect(withControls).toHaveLength(1);
    expect(withControls[0]).toHaveAttribute('aria-controls', 'panel-records');
  });

  it('gibt jedem Tab eine ID, auf die das Panel verweisen kann', () => {
    setup();
    for (const tab of TABS) {
      expect(document.getElementById(`tab-${tab.id}`)).not.toBeNull();
    }
  });

  it('zeigt Zähler nur, wo einer übergeben wurde', () => {
    setup();
    expect(screen.getByRole('tab', { name: /Records/ })).toHaveTextContent('12');
    expect(screen.getByRole('tab', { name: /Propagation/ })).not.toHaveTextContent(/\d/);
  });
});

describe('Tabs — Bedienung', () => {
  it('meldet einen Klick als Wechsel', async () => {
    const { onChange } = setup('records');
    await userEvent.click(screen.getByRole('tab', { name: /Mail/ }));
    expect(onChange).toHaveBeenCalledWith('mail');
  });

  it('wechselt mit Pfeil rechts zum nächsten Tab', async () => {
    const { onChange } = setup('records');
    screen.getAllByRole('tab')[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('propagation');
  });

  it('wechselt mit Pfeil links zum vorherigen Tab', async () => {
    const { onChange } = setup('security');
    screen.getByRole('tab', { selected: true }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('propagation');
  });

  it('läuft an den Rändern zyklisch um', async () => {
    const first = setup('records');
    screen.getByRole('tab', { selected: true }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(first.onChange).toHaveBeenCalledWith('mail');
    first.unmount();

    const last = setup('mail');
    screen.getByRole('tab', { selected: true }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(last.onChange).toHaveBeenCalledWith('records');
  });

  it('springt mit Home und End an die Ränder', async () => {
    const { onChange } = setup('security');
    screen.getByRole('tab', { selected: true }).focus();
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith('records');
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('mail');
  });

  it('lässt andere Tasten unbehandelt durch', async () => {
    const { onChange } = setup('records');
    screen.getAllByRole('tab')[0].focus();
    await userEvent.keyboard('{ArrowDown}{Escape}a');
    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * Fokus muss der Auswahl folgen, sonst springt die nächste Pfeiltaste aus
   * dem Nichts — sie rechnet vom aktiven Tab, nicht vom fokussierten.
   */
  it('zieht den Fokus auf den neu gewählten Tab', async () => {
    setup('records');
    screen.getAllByRole('tab')[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Propagation/ }));
  });
});

describe('Tabs — Mobile-Overflow', () => {
  /**
   * Der Kern von #11: acht Tabs brauchen über 800 px, auf 375 px waren die
   * hinteren unerreichbar. jsdom kennt kein Layout, also lässt sich nur
   * prüfen, dass der Scroll-Container und die Nicht-Schrumpf-Regel da sind.
   */
  it('ist ein horizontaler Scroll-Container mit nicht schrumpfenden Tabs', () => {
    setup();
    expect(screen.getByRole('tablist').className).toContain('overflow-x-auto');
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('shrink-0');
      expect(tab.className).toContain('whitespace-nowrap');
    }
  });
});
