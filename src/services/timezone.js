// Feste Turnier-Zeitzone: Die Eingabe der Startzeit gilt immer in dieser Zeitzone,
// unabhängig von Server- oder Browser-Zeitzone und -Sprache.
const TOURNAMENT_TZ = 'Europe/Berlin';

function partsIn(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

// Date -> "YYYY-MM-DDTHH:mm" in Turnier-Zeitzone (Wert für <input type="datetime-local">)
function formatLocalInput(date, timeZone = TOURNAMENT_TZ) {
  const p = partsIn(new Date(date), timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

// "YYYY-MM-DDTHH:mm" (Turnier-Zeitzone) -> Date
function parseLocalInput(value, timeZone = TOURNAMENT_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!m) return new Date(value);
  const wanted = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wanted;
  // Offset der Zeitzone iterativ bestimmen (deckt Sommer-/Winterzeit ab)
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), timeZone);
    guess += wanted - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  }
  return new Date(guess);
}

module.exports = { TOURNAMENT_TZ, formatLocalInput, parseLocalInput };
