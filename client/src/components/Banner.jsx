import { L } from '../i18n.js'

// Shown on every page, so nobody can mistake this for official results.
export default function Banner({ lang, demoMode }) {
  return (
    <div className="banner" role="note">
      <strong>{L(lang, 'UNOFFICIAL', 'BA NA HUKUMA BA')}</strong>
      {' · '}
      {L(lang, 'Independent analysis, not official results.', 'Bincike mai zaman kansa ne, ba sakamakon hukuma ba.')}
      {demoMode && (
        <>
          {' · '}
          <strong>{L(lang, 'DEMO: synthetic data only', 'GWAJI: bayanan kirkira ne kawai')}</strong>
        </>
      )}
    </div>
  )
}
