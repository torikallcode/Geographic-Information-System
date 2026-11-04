import { Check, Trash2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export function MeasurePanel({
  mode,
  value,
  pointCount,
  finished,
  onFinish,
  onClear,
}: {
  mode: 'distance' | 'area' | null;
  value: string;
  pointCount: number;
  finished: boolean;
  onFinish: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="measure-panel" role="status">
      <div className="measure-head">
        <span className={`measure-icon ${mode ?? ''}`}>{mode === 'area' ? '◲' : '⟋'}</span>
        <div>
          <small>{mode === 'area' || (!mode && pointCount > 2) ? t('measure.area') : t('measure.distance')}</small>
          <strong>{value || '—'}</strong>
        </div>
      </div>
      <p>
        {finished ? `${pointCount} ${t('measure.points')}` : `${t('measure.hint')} · ${pointCount} ${t('measure.points')}`}
      </p>
      <div className="measure-actions">
        {!finished ? (
          <button type="button" className="btn btn-primary btn-xs" onClick={onFinish} disabled={pointCount < 2}>
            <Check size={13} /> {t('measure.finish')}
          </button>
        ) : null}
        <button type="button" className="btn btn-outline btn-xs" onClick={onClear}>
          <Trash2 size={13} /> {t('measure.clear')}
        </button>
      </div>
    </div>
  );
}
