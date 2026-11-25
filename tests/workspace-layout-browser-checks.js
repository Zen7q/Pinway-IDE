// Real stylesheet/cold-load regression checks, run through display-harness.cjs.
(async () => {
  const $ = selector => document.querySelector(selector);
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const wait = async predicate => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw Error('Timed out waiting for workspace');
  };
  const choose = async id => {
    const label = `Pinway ${id[0].toUpperCase() + id.slice(1)}`;
    if ($('#workspace-toggle span').textContent === label) return;
    $('#workspace-toggle').click();
    const menu = $('#workspace-options').getBoundingClientRect();
    assert(menu.top >= 0 && menu.bottom <= innerHeight, 'Workspace menu outside viewport');
    $(`[data-workspace="${id}"]`).click();
    await wait(() => $('#workspace-toggle span').textContent === label);
  };
  const panels = { code: '#sidebar', build: '.design-sidebar', display: '.dp-left' };
  const handles = { code: '#sidebar-split', build: '.design-sash', display: '.dp-sidebar-sash' };
  const checkWidth = id => {
    const expected = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-sidebar-width'));
    assert(Math.abs($(panels[id]).getBoundingClientRect().width - expected) < 1, `${id} panel ignores shared width`);
    const panel = $(panels[id]).getBoundingClientRect();
    assert(Math.abs(panel.left - 16) < 1, `${id} sidebar does not share the shell inset`);
    const sash = $(handles[id]).getBoundingClientRect();
    const hit = document.elementFromPoint(sash.x + sash.width / 2, sash.y + sash.height / 2);
    assert($(handles[id]).contains(hit), `${id} sash cannot receive pointer input`);
  };
  try {
    await wait(() => $('#caption').textContent);
    assert(!$('#designer') && !$('#display-editor'), 'Workspaces must start unloaded');
    const first = new URLSearchParams(location.search).get('first') || 'display';
    await choose(first);
    if (first === 'display') assert(!$('#designer'), 'Display depends on Build startup');
    await choose('display');
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      const card = $('.dp-start').getBoundingClientRect();
      const symbol = $('.dp-start .design-welcome-symbol').getBoundingClientRect();
      const svg = $('.dp-start .design-welcome-symbol svg').getBoundingClientRect();
      assert(Math.abs(symbol.width - 49) < 3 && Math.abs(symbol.height - 49) < 3, 'Welcome symbol stretched into a bar');
      assert(svg.width === 25 && svg.height === 25, 'Welcome SVG is not 25px');
      assert(Math.abs(symbol.x + symbol.width / 2 - card.x - card.width / 2) < 1, 'Welcome symbol is not centered');
      assert(card.top >= 0 && card.bottom <= innerHeight, 'Welcome content outside viewport');
      const action = $('.dp-start button').getBoundingClientRect();
      assert(action.top >= card.top && action.bottom <= card.bottom, 'Welcome action is initially clipped');
      checkWidth('display');
    }
    for (const id of ['display', 'build', 'code', 'display']) {
      await choose(id);
      checkWidth(id);
      $(handles[id]).dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}));
      checkWidth(id);
      $(handles[id]).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
      checkWidth(id);
      if (id === 'build') assert(getComputedStyle($('#designer')).backgroundImage.includes('radial-gradient'), 'Build dot grid is missing');
    }
    assert(!testErrors.length, testErrors.join('\n'));
    document.body.dataset.layoutResult = 'pass';
    document.body.dataset.layoutReport = `${first}-first, welcome geometry, both themes, keyboard resize, shared widths, pointer hit targets, Build grid`;
  } catch (error) {
    document.body.dataset.layoutResult = 'fail';
    document.body.dataset.layoutReport = error.stack;
  }
})();
