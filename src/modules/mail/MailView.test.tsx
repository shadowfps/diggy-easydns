import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MailSecurity } from '@/types/dns';
import { MAIL_EXPLANATIONS } from '@/lib/explanations';
import { MailView } from './MailView';

/** Jede Mail-Karte erklärt ihren Begriff über ein „?“ neben dem Titel (#80). */

const MAIL: MailSecurity = {
  spf: { present: true, record: 'v=spf1 -all', lookupCount: 0, valid: true, issues: [] },
  dmarc: { present: true, record: 'v=DMARC1; p=reject', policy: 'reject' },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: true,
};

describe('MailView — Erklärungen', () => {
  it.each(['SPF', 'DKIM', 'DMARC', 'MTA-STS'] as const)('erklärt %s', async (term) => {
    const user = userEvent.setup();
    render(<MailView mail={MAIL} />);

    // Der Button steht neben der Überschrift, nicht in ihr — sonst würde der
    // Popover-Text Teil des Überschriftennamens.
    const heading = screen.getByRole('heading', { name: term });
    const button = screen.getByRole('button', { name: `Was bedeutet ${term}?` });
    expect(heading).not.toContainElement(button);

    await user.click(button);
    expect(screen.getByText(MAIL_EXPLANATIONS[term].text)).toBeInTheDocument();
  });
});
