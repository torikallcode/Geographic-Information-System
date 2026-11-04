import { ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { Modal } from '../ui';

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      title={t('about.title')}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t('about.close')}
        </button>
      }
      width={620}
    >
      <div className="about-content">
        <div className="about-hero">
          <span className="about-icon">
            <Info size={22} />
          </span>
          <p>{t('about.body')}</p>
        </div>

        <section>
          <h3>
            <ExternalLink size={16} /> {t('about.sourcesTitle')}
          </h3>
          <p className="muted-text">{t('about.sources')}</p>
        </section>

        <section>
          <h3>
            <ShieldCheck size={16} /> {t('about.disclaimerTitle')}
          </h3>
          <p className="muted-text">{t('about.disclaimer')}</p>
        </section>

        <div className="about-meta">
          <span>Versi 1.0 · MVP</span>
          <span>Kota Bandung · EPSG:4326</span>
          <span>MapLibre GL JS · PostGIS</span>
        </div>
      </div>
    </Modal>
  );
}
