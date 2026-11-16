import { L } from '../i18n.js'

const NAMES = {
  error: ['Must fix', 'Dole a gyara'],
  warning: ['Check', 'A duba'],
  info: ['Note', 'Bayani'],
}

// Shows what the checks found, in English or Hausa. It describes what does not add up. It never accuses anyone.
export default function FindingsList({ findings, lang, empty }) {
  if (!findings || findings.length === 0) {
    return <p className="ok-box">{empty || L(lang, 'All checks passed.', 'Duk binciken ya yi daidai.')}</p>
  }
  return (
    <ul className="findings">
      {findings.map((f, i) => (
        <li key={f.code + i} className={'finding ' + f.severity}>
          <span className="badge">
            {f.code} · {L(lang, ...NAMES[f.severity])}
          </span>
          <span>{lang === 'ha' ? f.message.ha : f.message.en}</span>
        </li>
      ))}
    </ul>
  )
}
