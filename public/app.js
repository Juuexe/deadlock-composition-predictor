const form = document.querySelector('#matchup');
const compare = document.querySelector('#compare');
const status = document.querySelector('#selection-status');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const selects = [];
let heroes = [], pending = false;

function update() {
  const chosen = selects.map(select => select.value).filter(Boolean);
  for (const select of selects) for (const option of select.options) {
    option.disabled = Boolean(option.value && option.value !== select.value && chosen.includes(option.value));
  }
  for (const select of selects) {
    const image = select.parentElement.querySelector('img');
    const hero = heroes.find(hero => String(hero.id) === select.value);
    image.hidden = !hero?.portrait;
    if (hero?.portrait && image.getAttribute('src') !== hero.portrait) image.src = hero.portrait;
  }
  document.querySelectorAll('.hero-search').forEach(input => { input.disabled = pending; });
  compare.disabled = pending || chosen.length !== 12 || new Set(chosen).size !== 12;
  document.querySelector('#swap').disabled = pending || selects.length !== 12 || !chosen.length;
  document.querySelector('#share').disabled = compare.disabled;
  status.textContent = pending ? 'Comparing compositions…' : `${chosen.length} of 12 heroes selected`;
}

function hideShare() { document.querySelector('#share-status').hidden = true; document.querySelector('#share-link-label').hidden = true; }
form.addEventListener('change', () => { result.hidden = true; error.hidden = true; hideShare(); update(); });
form.addEventListener('reset', () => { result.hidden = true; error.hidden = true; hideShare(); history.replaceState(null, '', location.pathname); requestAnimationFrame(() => { document.querySelectorAll('.hero-search').forEach(input => filterHeroes(input)); update(); }); });
document.querySelector('#swap').addEventListener('click', () => {
  const values = selects.map(select => select.value);
  document.querySelectorAll('.hero-search').forEach(input => { input.value = ''; filterHeroes(input); });
  selects.forEach((select, index) => { select.value = values[(index + 6) % 12]; });
  result.hidden = true; hideShare(); update();
});
document.querySelector('#share').addEventListener('click', async () => {
  const url = new URL(location.href); url.search = ''; url.hash = '';
  url.searchParams.set('a', selects.slice(0, 6).map(select => select.value).join(','));
  url.searchParams.set('b', selects.slice(6).map(select => select.value).join(','));
  history.replaceState(null, '', url);
  const message = document.querySelector('#share-status');
  const input = document.querySelector('#share-link'); input.value = url.href;
  document.querySelector('#share-link-label').hidden = false;
  try { await navigator.clipboard.writeText(url.href); message.textContent = 'Lineup link copied. Localhost links work only on a device running this app.'; }
  catch { message.textContent = 'Copy the lineup link below. Localhost links work only on a device running this app.'; }
  message.hidden = false;
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (compare.disabled) return;
  pending = true; result.hidden = true; error.hidden = true;
  const ids = selects.map(select => Number(select.value));
  selects.forEach(select => { select.disabled = true; });
  form.querySelector('[type=reset]').disabled = true;
  update();
  try {
    const response = await fetch('/api/predict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamA: ids.slice(0, 6), teamB: ids.slice(6) }),
      signal: AbortSignal.timeout(15000),
    });
    const prediction = await response.json();
    if (!response.ok) throw new Error(prediction.error);
    const a = prediction.teamAWinProbability * 100;
    document.querySelector('#result-title').textContent = Math.abs(a - 50) < 0.05 ? 'The compositions look evenly matched.' : a > 50 ? 'Your composition is favored.' : 'Their composition is favored.';
    document.querySelector('#chance-a').textContent = `${a.toFixed(1)}%`;
    document.querySelector('#chance-b').textContent = `${(100 - a).toFixed(1)}%`;
    document.querySelector('#advantage').value = a;
    document.querySelector('.result-note').textContent = prediction.modelKind === 'hero-pairs-logistic-v1'
      ? 'This model includes hero strength, teammate-pair associations and opponent matchups. Rare or unseen pairs add no adjustment.'
      : 'The hero-strength model performed better in validation. Experimental synergy and matchup terms are not used in this estimate.';
    const support = document.querySelector('#support'); support.replaceChildren();
    for (const entry of prediction.heroSupport) {
      const row = document.createElement('tr');
      for (const text of [heroes.find(hero => hero.id === entry.heroId)?.name ?? `Hero ${entry.heroId}`, entry.trainingAppearances]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      support.append(row);
    }
    result.hidden = false;
  } catch (failure) { error.textContent = failure instanceof Error ? failure.message : 'Could not compare these teams.'; error.hidden = false; }
  finally {
    pending = false; selects.forEach(select => { select.disabled = false; });
    form.querySelector('[type=reset]').disabled = false; update();
  }
});

async function loadHeroes() {
  try {
    const response = await fetch('/api/heroes', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not load the hero catalog. Refresh to retry.');
    heroes = (await response.json()).sort((a, b) => a.name.localeCompare(b.name));
    for (const team of ['teamA', 'teamB']) {
      const searchLabel = document.createElement('label'); searchLabel.className = 'search-label';
      searchLabel.textContent = `Search heroes for ${team === 'teamA' ? 'your team' : 'opposing team'}`;
      const search = document.createElement('input'); search.type = 'search'; search.className = 'hero-search'; search.placeholder = 'Type a hero name';
      search.dataset.team = team; search.addEventListener('input', () => filterHeroes(search));
      searchLabel.append(search); document.getElementById(team).append(searchLabel);
      const matches = document.createElement('p'); matches.className = 'search-matches'; matches.id = `${team}-matches`; matches.setAttribute('role', 'status');
      document.getElementById(team).append(matches);
      for (let slot = 1; slot <= 6; slot++) {
      const wrapper = document.createElement('div'); wrapper.className = 'pick';
      const label = document.createElement('label'); label.htmlFor = `${team}-${slot}`; label.textContent = `Pick ${slot}`;
      const select = document.createElement('select'); select.id = label.htmlFor; select.required = true;
      select.setAttribute('aria-label', `${team === 'teamA' ? 'Your team' : 'Opposing team'} hero ${slot}`);
      select.append(new Option('Choose a hero', ''));
      for (const hero of heroes) select.append(new Option(hero.name, String(hero.id)));
      const image = document.createElement('img'); image.alt = ''; image.width = 40; image.height = 40; image.hidden = true; image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.hidden = true; });
      wrapper.append(label, image, select); document.getElementById(team).append(wrapper); selects.push(select);
      }
    }
    update();
    const params = new URLSearchParams(location.search);
    if (params.has('a') || params.has('b')) {
      const a = params.get('a')?.split(',') ?? [], b = params.get('b')?.split(',') ?? [];
      const ids = [...a, ...b];
      if (a.length !== 6 || b.length !== 6 || new Set(ids).size !== 12
        || ids.some(id => !/^[1-9]\d*$/.test(id) || !heroes.some(hero => String(hero.id) === id))) {
        error.textContent = 'This lineup link contains invalid or unsupported heroes. Select teams manually.'; error.hidden = false;
      } else { selects.forEach((select, i) => { select.value = ids[i]; }); update(); }
    }
  } catch (failure) { error.textContent = failure.message; error.hidden = false; status.textContent = 'Hero catalog unavailable'; }
}
function filterHeroes(input) {
  const query = input.value.trim().toLocaleLowerCase();
  const matches = heroes.filter(hero => hero.name.toLocaleLowerCase().includes(query));
  for (const select of selects.filter(select => select.id.startsWith(`${input.dataset.team}-`))) {
    const selected = select.value;
    select.replaceChildren(new Option('Choose a hero', ''));
    for (const hero of heroes) if (matches.includes(hero) || String(hero.id) === selected) select.append(new Option(hero.name, String(hero.id)));
    select.value = selected;
  }
  document.getElementById(`${input.dataset.team}-matches`).textContent = query ? `${matches.length} matching heroes. Current picks stay visible.` : '';
  update();
}
loadHeroes();
async function loadEvidence() {
  const target = document.querySelector('#model-evidence');
  try {
    const response = await fetch('/api/evidence', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    const evidence = await response.json(), report = evidence.reliability;
    target.textContent = report
      ? `Model ${evidence.modelVersion} · ${report.count.toLocaleString()} later matches · ${(report.accuracy * 100).toFixed(1)}% winner accuracy · ${(report.coverage * 100).toFixed(0)}% coverage. Log loss ${report.logLoss.toFixed(4)}; Brier score ${report.brierScore.toFixed(4)}. Evaluation updated ${new Date(report.updatedAt).toLocaleString()}. ${report.nextAnnouncement ? 'A later gameplay announcement limits this evaluation period.' : 'Patch deployment boundaries remain unverified.'}`
      : `Model ${evidence.modelVersion}. Matching prospective evidence is unavailable for this version.`;
    if (evidence.unsupportedHeroes?.length) target.textContent += ` Current catalog heroes not supported by this model: ${evidence.unsupportedHeroes.join(', ')}. These heroes cannot be selected; roster coverage needs re-evaluation.`;
  } catch { target.textContent = 'Model evidence is currently unavailable. Predictions remain experimental.'; }
}
loadEvidence();
