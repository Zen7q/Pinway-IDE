if (window.__TAURI__) {
  const toolbar = document.getElementById('toolbar');
  toolbar.before(document.querySelector('.zoom-controls'));
  const tools = document.getElementById('tools-menu');
  tools.classList.remove('popover');
  tools.classList.add('board-inspector');
  document.querySelector('.workspace').after(tools);
  document.getElementById('version').textContent = 'v0.2';
  const { core, event, window: controls } = window.__TAURI__;
  document.documentElement.dataset.host = 'tauri';
  window.pinway = {
    call: (action, payload = null) => core.invoke('pinway', { action, payload }).then(result =>
      action === 'select' && result === null ? undefined : result).catch(error => {
      throw new Error(String(error));
    }),
    subscribe: fn => event.listen('pinway-event', ({ payload }) => fn(payload.type, payload.data))
  };
  document.addEventListener('mousedown', event => {
    if (event.button === 0 && event.target.closest('.title.drag') && !event.target.closest('button')) {
      void controls.getCurrentWindow().startDragging().catch(() => {});
    }
  });
}
