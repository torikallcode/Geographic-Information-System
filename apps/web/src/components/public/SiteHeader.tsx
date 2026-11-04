import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, LogIn, Menu, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { Logo } from '../ui';

export function SiteHeader({
  searchSlot,
  onAbout,
  onToggleLayers,
  layersOpen,
}: {
  searchSlot: ReactNode;
  onAbout: () => void;
  onToggleLayers: () => void;
  layersOpen: boolean;
}) {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();

  return (
    <header className="site-header">
      <Link to="/" className="site-brand" aria-label={`${t('app.name')} — ${t('nav.map')}`}>
        <Logo />
      </Link>

      <div className="site-search">{searchSlot}</div>

      <nav className="site-nav" aria-label="Navigasi utama">
        <Link to="/" className="nav-link active">
          {t('nav.map')}
        </Link>
        <button type="button" className="nav-link" onClick={onAbout}>
          {t('nav.about')}
        </button>
        <div className="lang-toggle" role="group" aria-label={t('lang.label')}>
          <button type="button" className={lang === 'id' ? 'active' : ''} onClick={() => setLang('id')} aria-pressed={lang === 'id'}>
            ID
          </button>
          <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>
            EN
          </button>
        </div>
        {user ? (
          <Link to="/admin" className="btn btn-primary btn-sm">
            <LayoutDashboard size={15} />
            {t('nav.admin')}
          </Link>
        ) : (
          <Link to="/login" className="btn btn-outline btn-sm">
            <LogIn size={15} />
            {t('nav.login')}
          </Link>
        )}
      </nav>

      <button type="button" className="icon-button site-menu-button" onClick={onToggleLayers} aria-label={layersOpen ? t('tools.close') : t('tools.layers')}>
        {layersOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
    </header>
  );
}
