/** Async transport to the Android Java driver; no HTTP endpoint or stored credentials. */
export function nativeTransport(bridge, target = globalThis) {
  let sequence = 0;
  const pending = new Map();
  target.__psqlNativeReply = text => {
    const reply = JSON.parse(text);
    const call = pending.get(reply.id);
    if (!call) return;
    pending.delete(reply.id);
    clearTimeout(call.timer);
    if (reply.error) call.reject(new Error(reply.error));
    else call.resolve(reply.data);
  };
  return (path, data = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Operazione scaduta. Verifica la rete e riconnettiti.'));
    }, path === '/export' ? 300000 : 45000);
    pending.set(id, { resolve, reject, timer });
    try { bridge.request(id, path, JSON.stringify(data)); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
