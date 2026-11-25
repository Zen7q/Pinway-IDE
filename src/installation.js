const displayVersion = version => String(version).replace(/-alpha(?=\.|$)/, " alpha");
const $ = id => document.getElementById(id);
const names = { arduino: 'Arduino AVR', esp32: 'ESP32', build: 'Pinway Build', display: 'Pinway Display' };

export function mountInstallation({ call, theme, setTheme, autoUpdates, busy, setBusy, beforeRemove, changed }) {
  let state = { packs: [] };
  let running = false;
  let step = 0;
  let requested = '';
  let update = null;
  let checking = false;
  const selected = new Set();
  const has = id => id === 'code' || state.packs.some(pack => pack.id === id && pack.installed);
  function message(text, error = false) {
    for (const id of ['package-status', 'setup-status', 'package-prompt-status']) {
      $(id).textContent = text;
      $(id).classList.toggle('error', error);
    }
  }
  function render() {
    const list = $('package-list');
    list.replaceChildren();
    for (const pack of state.packs) {
      const row = document.createElement('div');
      row.className = 'package-row';
      const detail = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = pack.name;
      const description = document.createElement('small');
      description.textContent = pack.description;
      detail.append(title, description);
      const action = document.createElement('button');
      action.type = 'button'; action.className = 'button compact';
      action.textContent = pack.required ? 'У комплекті' : pack.installed ? 'Видалити' : 'Встановити';
      action.disabled = pack.required || running;
      action.dataset.pack = pack.id;
      action.onclick = () => void change(pack.id, !pack.installed);
      row.append(detail, action); list.append(row);
    }
    for (const id of ['esp32', 'build', 'display']) {
      const input = $('setup-' + id);
      input.checked = has(id) || selected.has(id);
      input.disabled = has(id) || running;
    }
    for (const button of document.querySelectorAll('#setup-dialog button, #package-prompt button')) button.disabled = running;
    $('setup-back').hidden = step === 0;
    $('setup-next').textContent = step === 2 ? 'Почати роботу' : 'Далі';
    document.querySelectorAll('[data-setup-step]').forEach(el => { el.hidden = Number(el.dataset.setupStep) !== step; });
    $('setup-step-label').textContent = `Крок ${step + 1} із 3`;
    document.querySelectorAll('.setup-steps span').forEach((el, index) => el.classList.toggle('active', index === step));
    $('package-prompt-install').textContent = 'Встановити ' + (names[requested] || 'пакет');
  }
  async function refresh() {
    state = await call('packs'); render(); return state;
  }
  async function change(id, install) {
    if (running || busy()) { message('Зачекайте завершення поточної операції.'); return false; }
    if (!install && !await beforeRemove(id)) return false;
    running = true; setBusy(true); message((install ? 'Встановлення ' : 'Видалення ') + names[id] + '…'); render();
    try {
      state = await call(install ? 'packInstall' : 'packRemove', id);
      message(install ? names[id] + ' встановлено.' : names[id] + ' видалено. Ваші проєкти збережені.');
      await changed(state);
      return true;
    } catch (error) {
      message(error.message + ' Можна повторити спробу.', true);
      try { await refresh(); await changed(state); } catch { /* Keep the actionable original error. */ }
      return false;
    } finally { running = false; setBusy(false); render(); }
  }
  function offer(id) {
    requested = id; message('');
    $('package-prompt-title').textContent = 'Додати ' + names[id] + '?';
    $('package-prompt-description').textContent = state.packs.find(p => p.id === id)?.description || '';
    render(); if (!$('package-prompt').open) $('package-prompt').showModal();
    return new Promise(resolve => $('package-prompt').addEventListener('close', () => resolve(has(id)), { once: true }));
  }
  $('package-prompt-install').onclick = async () => {
    if (await change(requested, true)) $('package-prompt').close();
  };
  $('package-prompt-later').onclick = () => $('package-prompt').close();
  for (const id of ['esp32', 'build', 'display']) $('setup-' + id).onchange = event => {
    if (event.target.checked) selected.add(id); else selected.delete(id);
  };
  $('setup-theme').onchange = event => setTheme(event.target.value);
  $('setup-back').onclick = () => { step = Math.max(0, step - 1); render(); };
  $('setup-next').onclick = async () => {
    if (step < 2) { step++; render(); return; }
    for (const id of selected) if (!has(id) && !await change(id, true)) return;
    try {
      await call('finishSetup'); state.onboarded = true; $('setup-dialog').close();
    } catch (error) { message(error.message, true); }
  };
  for (const id of ['setup-dialog', 'package-prompt']) $(id).addEventListener('cancel', event => {
    if (running || id === 'setup-dialog') event.preventDefault();
  });
  async function checkUpdates() {
    if (checking) return;
    checking = true; $('update-check').disabled = true;
    $('update-status').textContent = 'Перевірка оновлень…';
    try {
      update = await call('updateCheck');
      $('update-status').textContent = update.available ? 'Доступна версія ' + displayVersion(update.version) + '. Встановлення за вашим бажанням.'
        : update.published ? 'У вас актуальна версія.' : 'Нових опублікованих версій поки немає.';
      for (const button of document.querySelectorAll('[data-update]')) button.hidden = !update.available;
    } catch (error) {
      $('update-status').textContent = 'Не вдалося перевірити оновлення. Поточна версія працює далі.';
    } finally { checking = false; $('update-check').disabled = false; }
  }
  $('update-check').onclick = () => void checkUpdates();
  function showUpdate() {
    $('settings-dialog').close();
    $('update-version').textContent = 'Версія ' + displayVersion(update.version) + '. Поточна версія залишиться доступною, доки ви самі не встановите нову.';
    $('update-dialog').showModal();
  }
  document.querySelectorAll('[data-update]').forEach(button => { button.onclick = showUpdate; });
  $('update-download').onclick = async () => {
    if (running || busy()) return;
    running = true; setBusy(true); $('update-download').disabled = true;
    $('update-download-status').textContent = 'Завантаження інсталятора…';
    try {
      await call('updateInstall');
      $('update-download-status').textContent = 'Інсталятор відкрито. Збережіть роботу перед заміною застосунку.';
    } catch (error) { $('update-download-status').textContent = error.message; }
    finally { running = false; setBusy(false); $('update-download').disabled = false; }
  };
  return {
    has, offer, refresh,
    subscribe(type, data) {
      if (type === 'packProgress') {
        message(data.total ? `Завантаження ${names[data.id]} · ${Math.round(data.received / data.total * 100)}%` : data.message);
      }
      if (type === 'console' && running && data) {
        const line = data.trim().split('\n').at(-1);
        if (line) message(line.slice(-180));
      }
      if (type === 'updateProgress') $('update-download-status').textContent = 'Завантаження · ' + Math.round(data.received / data.total * 100) + '%';
    },
    async initialize() {
      await refresh();
      $('version').textContent = 'v' + displayVersion(state.version);
      $('installed-version').textContent = 'Pinway IDE ' + displayVersion(state.version);
      if (!state.onboarded) {
        $('setup-theme').value = theme(); render(); $('setup-dialog').showModal();
      }
      if (autoUpdates()) void checkUpdates();
    }
  };
}
