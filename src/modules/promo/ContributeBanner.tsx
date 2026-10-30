import { Icon } from '@mittwald/flow-react-components';
import { IconBrandGithub } from '@tabler/icons-react';
import { GITHUB_URL } from '@/lib/project';
import { useI18n } from '@/i18n';
import { PromoTile } from './PromoTile';

/**
 * Aufruf zum Mitmachen: diggy ist Open Source. Die dunkle Kachel mit der
 * Farbkugel neben der Converter-Kachel (PromoTile).
 *
 * Wie der Converter-Hinweis nur auf der Startseite: Im Report lenkte eine
 * Kachel von den Ergebnissen ab.
 */
export function ContributeBanner() {
  const { t } = useI18n();
  return (
    <PromoTile
      tone="orb"
      id="contribute-heading"
      eyebrow={t('Open Source')}
      title={t('Mitgestalten erwünscht. Bring deine Idee ein.')}
      icon={
        <Icon>
          <IconBrandGithub />
        </Icon>
      }
      href={GITHUB_URL}
      cta={t('diggy auf GitHub')}
    />
  );
}
