const captured = [];
globalThis.window = { __ModuleLoader__: { load: (r) => captured.push(r) } };
await import(new URL(process.argv[2], 'file:///').href);
if (captured.length !== 1) { console.error('registrations: ' + captured.length); process.exit(2); }
const reg = captured[0];
const React = { createElement: (...a) => ({ a }), useState: () => [undefined, () => {}], useEffect: () => {}, useMemo: (f) => f(), useSyncExternalStore: () => undefined };
const plugin = reg.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});
if (typeof plugin !== 'object' || plugin === null) { console.error('factory returned ' + typeof plugin); process.exit(3); }
if (typeof plugin.apply !== 'function') { console.error('plugin has no apply'); process.exit(4); }
if (!Array.isArray(plugin.inject)) { console.error('plugin has no inject array'); process.exit(5); }
console.log(JSON.stringify({ id: reg.id, inject: plugin.inject }));
