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
  compare.disabled = pending || chosen.length !== 12 || new Set(chosen).size !== 12;
  status.textContent = pending ? 'Comparing compositions…' : `${chosen.length} of 12 heroes selected`;
}

form.addEventListener('change', () => { result.hidden = true; error.hidden = true; update(); });
form.addEventListener('reset', () => { result.hidden = true; error.hidden = true; requestAnimationFrame(update); });
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
    for (const team of ['teamA', 'teamB']) for (let slot = 1; slot <= 6; slot++) {
      const wrapper = document.createElement('div'); wrapper.className = 'pick';
      const label = document.createElement('label'); label.htmlFor = `${team}-${slot}`; label.textContent = `Pick ${slot}`;
      const select = document.createElement('select'); select.id = label.htmlFor; select.required = true;
      select.setAttribute('aria-label', `${team === 'teamA' ? 'Your team' : 'Opposing team'} hero ${slot}`);
      select.append(new Option('Choose a hero', ''));
      for (const hero of heroes) select.append(new Option(hero.name, String(hero.id)));
      wrapper.append(label, select); document.getElementById(team).append(wrapper); selects.push(select);
    }
    update();
  } catch (failure) { error.textContent = failure.message; error.hidden = false; status.textContent = 'Hero catalog unavailable'; }
}
loadHeroes();
