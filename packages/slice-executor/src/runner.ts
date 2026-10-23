import { json } from 'node:stream/consumers';
import { getQuickJS } from 'quickjs-emscripten';
import { decodeRunnerPayload, type RunnerPayload, type SliceTraceEvent } from './types/types.js';

type Runtime = {
  importValue(moduleName: string, importedName: string, localName: string): unknown;
  run(target: unknown): Promise<void>;
};

type ReactRuntime = {
  createElement(
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
  Fragment: symbol;
  useState(initial: unknown): [unknown, (value: unknown) => undefined];
  useRef(initial: unknown): { current: unknown };
  useMemo(factory: () => unknown): unknown;
  useCallback(callback: unknown): unknown;
  useEffect(): undefined;
  useLayoutEffect(): undefined;
  useReducer(
    reducer: unknown,
    initial: unknown,
    initializer?: (value: unknown) => unknown
  ): [unknown, (value: unknown) => undefined];
};

type SliceExecutor = (runtime: Runtime, react: ReactRuntime) => Promise<void>;

/**
 * This function runs from its stringified source inside the WASM sandbox
 * Keep it self-contained: references to host objects would let the evaluated
 * component escape through their constructors
 */
async function runSandboxed(payload: RunnerPayload, execute: SliceExecutor): Promise<string> {
  const safeStringify = JSON.stringify.bind(JSON);
  const events: SliceTraceEvent[] = [];
  const seenControls = new Set<string>();
  const seenReads = new Set<string>();
  const record = (event: SliceTraceEvent) => {
    if (events.length >= payload.maxTraceEvents) throw new Error('trace event limit exceeded');
    events.push(event);
  };
  const recordRead = (path: string[]) => {
    if (path[0] !== payload.settingKey) return;
    const key = path.join('\0');
    if (seenReads.has(key)) return;
    seenReads.add(key);
    record({ kind: 'read', path });
  };

  const backing: Record<string, unknown> = {};
  const proxyCache = new Map<string, object>();
  const storeProxy = (path: string[] = []): object => {
    const cacheKey = path.join('.');
    const cached = proxyCache.get(cacheKey);
    if (cached) return cached;
    const proxy = new Proxy(
      {},
      {
        get(_target, property) {
          if (typeof property !== 'string') return undefined;
          const nextPath = [...path, property];
          recordRead(nextPath);
          let current: unknown = backing;
          for (const part of nextPath) {
            if (!current || typeof current !== 'object') return storeProxy(nextPath);
            current = (current as Record<string, unknown>)[part];
          }
          return current === undefined ? storeProxy(nextPath) : current;
        },
        set(_target, property, value) {
          if (typeof property !== 'string') return false;
          const nextPath = [...path, property];
          let current = backing;
          for (const part of nextPath.slice(0, -1)) {
            const existing = current[part];
            if (!existing || typeof existing !== 'object') current[part] = {};
            current = current[part] as Record<string, unknown>;
          }
          current[nextPath.at(-1) as string] = value;
          if (nextPath[0] === payload.settingKey) record({ kind: 'write', path: nextPath, value });
          return true;
        },
      }
    );
    proxyCache.set(cacheKey, proxy);
    return proxy;
  };

  const definePluginSettings = (definitions: Record<string, { default?: unknown }> = {}) => {
    for (const [key, definition] of Object.entries(definitions)) {
      if ('default' in definition) backing[key] = definition.default;
    }
    const value = {
      store: storeProxy(),
      plain: storeProxy(),
      use: (keys: string[]) => {
        const snapshot: Record<string, unknown> = {};
        for (const key of keys ?? []) {
          recordRead([key]);
          snapshot[key] = backing[key] ?? [];
        }
        return snapshot;
      },
      withPrivateSettings() {
        return value;
      },
    };
    return value;
  };

  const sentinelFor = (component: string): unknown => {
    if (/switch|checkbox/i.test(component)) return true;
    if (/slider|number/i.test(component)) return 1;
    if (/select|radio/i.test(component)) return 'selected';
    return 'text';
  };

  const component = (name: string) => {
    const result = (props: Record<string, unknown> = {}) => {
      if (!seenControls.has(name)) {
        seenControls.add(name);
        record({ kind: 'control', component: name });
      }
      for (const callbackName of ['onChange', 'onValueChange', 'onSelect']) {
        const callback = props[callbackName];
        if (typeof callback === 'function') {
          try {
            const pending = callback(sentinelFor(name));
            if (pending && typeof (pending as PromiseLike<unknown>).then === 'function')
              void Promise.resolve(pending).catch(() => undefined);
          } catch (error) {
            if (String(error).includes('trace event limit exceeded')) throw error;
          }
        }
      }
      return props.children ?? null;
    };
    Object.defineProperty(result, 'name', { value: name });
    // Discord components expose static presentation enums used in JSX props
    return Object.assign(result, {
      Colors: { RED: 'red', BRAND: 'brand', PRIMARY: 'primary', GREEN: 'green' },
      Sizes: { SMALL: 'small', MEDIUM: 'medium', LARGE: 'large' },
      Looks: { FILLED: 'filled', OUTLINED: 'outlined', LINK: 'link' },
    });
  };

  const OptionType = {
    STRING: 0,
    NUMBER: 1,
    BIGINT: 2,
    BOOLEAN: 3,
    SELECT: 4,
    SLIDER: 5,
    COMPONENT: 6,
    CUSTOM: 7,
  };

  const React: ReactRuntime = {
    createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
      const merged = { ...(props ?? {}), ...(children.length ? { children } : {}) };
      if (typeof type !== 'function') return merged;
      try {
        return (type as (properties: Record<string, unknown>) => unknown)(merged);
      } catch (error) {
        if (
          String(error).includes('trace event limit exceeded') ||
          String(error).includes('Code generation from strings disallowed')
        )
          throw error;
        return null;
      }
    },
    Fragment: Symbol.for('Fragment'),
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      () => undefined,
    ],
    useRef: (initial: unknown) => ({ current: initial }),
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    useReducer: (
      _reducer: unknown,
      initial: unknown,
      initializer?: (value: unknown) => unknown
    ) => [initializer ? initializer(initial) : initial, () => undefined],
  };

  const reactHooks = React as unknown as Record<string, unknown>;
  const classNameFactory =
    (prefix = '') =>
    (...parts: unknown[]) =>
      `${prefix}${parts.filter((part) => typeof part === 'string' && part).join(' ')}`;
  const debounce = () => () => undefined;
  class Logger {
    debug() {}
    error() {}
    info() {}
    log() {}
    warn() {}
  }

  let initialHasDefault = false;
  let initialValue: unknown;
  const runtime: Runtime = {
    importValue(moduleName: string, importedName: string, localName: string): unknown {
      if (localName === 'OptionType' || importedName === 'OptionType') return OptionType;
      if (localName === 'React' || (importedName === '*' && /react/i.test(moduleName)))
        return React;
      if (localName === 'definePluginSettings' || importedName === 'definePluginSettings')
        return definePluginSettings;
      if (localName === 'definePlugin' || importedName === 'default')
        return (value: unknown) => value;
      const hookName = importedName === 'default' ? localName : importedName;
      if (/^use[A-Z]/.test(hookName)) {
        if (Object.hasOwn(reactHooks, hookName)) return reactHooks[hookName];
        if (hookName === 'useForceUpdater') return () => () => undefined;
        if (hookName === 'useStateFromStores') {
          return (...args: unknown[]) => {
            const snapshot = args.findLast((value) => typeof value === 'function');
            return snapshot ? snapshot() : {};
          };
        }
        return () => undefined;
      }
      if (localName === 'classNameFactory' || importedName === 'classNameFactory')
        return classNameFactory;
      if (localName === 'debounce' || importedName === 'debounce') return debounce;
      if (localName === 'Logger' || importedName === 'Logger') return Logger;
      if (/settings/i.test(localName)) return definePluginSettings();
      if (/react/i.test(moduleName))
        return importedName === 'default' ? React : component(localName);
      return component(localName);
    },
    async run(target: unknown): Promise<void> {
      initialHasDefault = Object.hasOwn(backing, payload.settingKey);
      initialValue = backing[payload.settingKey];
      if (typeof target === 'function')
        await (target as (properties: Record<string, unknown>) => unknown)({});
    },
  };

  try {
    await execute(runtime, React);
    const settingEvents = events.filter(
      (event) => event.kind === 'control' || event.path?.[0] === payload.settingKey
    );
    return safeStringify({
      ok: true,
      events: settingEvents,
      hasDefault: initialHasDefault,
      ...(initialHasDefault ? { value: initialValue } : {}),
      evidence: settingEvents.map(
        (event) => `${event.kind}:${event.path?.join('.') ?? event.component}`
      ),
    });
  } catch (error) {
    return safeStringify({
      ok: false,
      code: String(error).includes('limit') ? 'execution-limit' : 'execution-failed',
      message: error instanceof Error ? error.message : String(error),
      evidence: events.map((event) => `${event.kind}:${event.path?.join('.') ?? event.component}`),
    });
  }
}

const quickJS = await getQuickJS();
process.stdout.write('__SLICE_READY__\n');

try {
  const payload = decodeRunnerPayload(await json(process.stdin));
  using runtime = quickJS.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  using context = runtime.newContext();
  // Keep the runtime and all evaluated values inside WASM, with no host bindings
  const source = `
    globalThis.IS_DISCORD_DESKTOP = true;
    globalThis.IS_LINUX = false;
    globalThis.IS_MAC = false;
    globalThis.IS_STANDALONE = true;
    globalThis.IS_UPDATER_DISABLED = true;
    globalThis.IS_WEB = false;
    globalThis.IS_WINDOWS = false;
    globalThis.VencordNative = { pluginHelpers: {} };
    const disallowCodeGeneration = () => {
      throw new EvalError('Code generation from strings disallowed');
    };
    for (const callable of [function() {}, async function() {}, function*() {}, async function*() {}]) {
      Object.defineProperty(Object.getPrototypeOf(callable), 'constructor', {
        value: disallowCodeGeneration,
      });
    }
    globalThis.eval = disallowCodeGeneration;
    globalThis.Function = disallowCodeGeneration;
    (${runSandboxed.toString()})(${JSON.stringify(payload)}, async (__runtime, React) => {
      ${payload.code}
    })
  `;
  using evaluation = context.evalCode(source, 'component-slice.js');
  if (evaluation.error) throw new Error(String(context.dump(evaluation.error)?.message));
  using jobs = runtime.executePendingJobs();
  if (jobs.error) throw new Error(String(context.dump(jobs.error)?.message));
  const state = context.getPromiseState(evaluation.value);
  if (state.type === 'pending') throw new Error('slice did not settle');
  if (state.type === 'rejected') {
    using error = state.error;
    throw new Error(String(context.dump(error)?.message));
  }
  using response = state.value;
  process.stdout.write(context.getString(response));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    JSON.stringify({
      ok: false,
      code: /out of memory|stack overflow/i.test(message) ? 'execution-limit' : 'execution-failed',
      message,
      evidence: [],
    })
  );
}
