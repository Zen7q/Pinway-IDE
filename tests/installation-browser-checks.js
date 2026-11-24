(async () => {
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw Error('Timed out waiting for UI state');
  };
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const $ = id => document.getElementById(id);
  const results = [];
  try {
    await waitFor(() => $('setup-dialog').open);
    assert(!document.getElementById('designer') && !document.getElementById('display-editor'), 'Optional workspaces loaded at startup');
    $('setup-theme').value = 'light'; $('setup-theme').dispatchEvent(new Event('change'));
    assert(document.documentElement.dataset.theme === 'light', 'Setup theme not applied');
    $('setup-next').click(); $('setup-next').click();
    $('setup-next').click();
    await waitFor(() => !$('setup-dialog').open);
    assert(testCalls.some(call => call.action === 'finishSetup'), 'Setup was not saved');
    results.push('Setup, theme and minimal startup');
    $('workspace-toggle').click();
    document.querySelector('[data-workspace="build"]').click();
    await waitFor(() => $('package-prompt').open);
    $('package-prompt-later').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    assert(!document.getElementById('designer'), 'Cancel installed a workspace');
    $('workspace-toggle').click(); document.querySelector('[data-workspace="build"]').click();
    await waitFor(() => $('package-prompt').open);
    $('package-prompt-install').click();
    await waitFor(() => $('workspace-toggle').querySelector('span').textContent === 'Pinway Build');
    assert(testCalls.some(call => call.action === 'packModule' && call.p === 'build'), 'Build was not loaded from the package API');
    results.push('Optional Build installation, cancellation and lazy load');
    $('workspace-toggle').click(); document.querySelector('[data-workspace="code"]').click();
    await waitFor(() => $('workspace-toggle').querySelector('span').textContent === 'Pinway Code');
    $('settings-view').click();
    const remove = document.querySelector('[data-pack="build"]');
    assert(remove.textContent === 'Видалити', 'Installed package was not reflected in settings');
    remove.click();
    await waitFor(() => document.querySelector('[data-pack="build"]').textContent === 'Встановити');
    results.push('Package removal');
    $('settings-dialog').close();
    await waitFor(() => [...document.querySelectorAll('[data-update]')].some(button => !button.hidden));
    document.querySelector('[data-update]:not([hidden])').click();
    assert($('update-dialog').open, 'Update action did not open a confirmation dialog');
    $('update-dialog').close();
    assert(!testCalls.some(call => call.action === 'updateInstall'), 'Update installed without user action');
    results.push('Optional updates and postponement');
    assert(!testErrors.length, testErrors.join('\n'));
    document.body.dataset.testResult = 'pass';
    document.body.dataset.testReport = results.join(' | ');
  } catch (error) {
    document.body.dataset.testResult = 'fail'; document.body.dataset.testReport = error.stack;
  }
  const output = document.createElement('pre'); output.id = 'installation-test-result';
  output.textContent = document.body.dataset.testResult + '\n' + document.body.dataset.testReport;
  output.style.cssText = 'position:fixed;bottom:0;left:0;z-index:99999;padding:12px;background:#123;color:white;max-width:100%;white-space:pre-wrap';
  document.body.append(output);
})();
