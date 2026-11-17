if (window.__TAURI__) {
  const toolbar = document.getElementById('toolbar');
  toolbar.before(document.querySelector('.zoom-controls'));
  const { core, event, window: controls } = window.__TAURI__;
  document.documentElement.dataset.host = 'tauri';
  const appWindow = controls.getCurrentWindow();
  if (navigator.platform.startsWith('Mac')) {
    const root = document.documentElement;
    root.dataset.macos = '';
    const updateFullscreen = async () => {
      root.toggleAttribute('data-fullscreen', await appWindow.isFullscreen());
    };
    const sync = () => { void updateFullscreen().catch(console.error); };
    void appWindow.onResized(sync).then(sync).catch(console.error);
  }
  window.pinway = {
    call: (action, payload = null) => core.invoke('pinway', { action, payload }).then(result =>
      action === 'select' && result === null ? undefined : result).catch(error => {
      throw new Error(String(error));
    }),
    subscribe: fn => event.listen('pinway-event', ({ payload }) => fn(payload.type, payload.data))
  };
  document.addEventListener('mousedown', event => {
    if (event.button === 0 && event.target.closest('.title.drag') && !event.target.closest('button')) {
      void appWindow.startDragging().catch(() => {});
    }
  });
}
