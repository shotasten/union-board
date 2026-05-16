import { api } from './lib/api';

// Expose api globally so the inline scripts in index.html can call it
(window as unknown as Record<string, unknown>).api = api;

// GAS compatibility layer
// Implements `google.script.run.withSuccessHandler(cb).funcName(args)` pattern
// so the existing HTML (originally for GAS) works without modification.

interface GasContext {
  _sh: ((result: unknown) => void) | null;
  _fh: ((err: { message: string }) => void) | null;
}

function makeGasProxy(ctx: GasContext): unknown {
  return new Proxy(ctx as unknown as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop === 'withSuccessHandler') {
        return (cb: (result: unknown) => void) =>
          makeGasProxy({ _sh: cb, _fh: target._fh as GasContext['_fh'] });
      }
      if (prop === 'withFailureHandler') {
        return (cb: (err: { message: string }) => void) =>
          makeGasProxy({ _sh: target._sh as GasContext['_sh'], _fh: cb });
      }

      // Dynamic function name → call api[prop]
      return (...args: unknown[]) => {
        const fn = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
        if (typeof fn !== 'function') {
          const err = { message: `API function not implemented: ${prop}` };
          if (target._fh) (target._fh as GasContext['_fh'])!(err);
          else console.error(err.message);
          return;
        }
        fn(...args)
          .then((result) => {
            if (target._sh) (target._sh as GasContext['_sh'])!(result);
          })
          .catch((e: Error) => {
            const err = { message: e?.message ?? String(e) };
            if (target._fh) (target._fh as GasContext['_fh'])!(err);
            else console.error(`GAS compat error [${prop}]:`, e);
          });
      };
    },
  });
}

const gasRun = makeGasProxy({ _sh: null, _fh: null });

(window as unknown as Record<string, unknown>).google = {
  script: { run: gasRun },
};
