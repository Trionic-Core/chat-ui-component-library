/* The Java endpoint authenticates the user and holds the enterprise API key. */
const target = document.getElementById('chat');
const styleNonce = document.currentScript?.nonce || undefined;
const chat = CypherXChat.mount(target, {
  endpoint: target.dataset.endpoint,
  title: 'Assistant',
  height: 'min(700px, 90dvh)',
  nonce: styleNonce,
  headers: function () {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    const header = document.querySelector('meta[name="csrf-header"]')?.content;
    return token && header ? { [header]: token } : {};
  }
});
window.addEventListener('pagehide', function (event) {
  if (!event.persisted) chat.destroy();
});
