import { createContext, Script } from 'node:vm';

interface RunnerPayload {
  readonly code: string;
  readonly settingKey: string;
  readonly maxTraceEvents: number;
}

export {};

type TraceEvent = {
  kind: 'read' | 'write' | 'control';
  path?: string[];
  component?: string;
  value?: unknown;
};

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
 * This function is stringified and evaluated wholly inside a context with no host objects.
 * Keep it self-contained: closing over runner-module values would expose host-realm objects to
 * the component slice and make constructor-based context escapes possible.
 */
async function runSandboxed(payload: RunnerPayload, execute: SliceExecutor): Promise<string> {
  const safeStringify = JSON.stringify.bind(JSON);
  const events: TraceEvent[] = [];
  const seenControls = new Set<string>();
  const seenReads = new Set<string>();
  const record = (event: TraceEvent) => {
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
    return result;
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
            for (let index = args.length - 1; index >= 0; index--) {
              const snapshot = args[index];
              if (typeof snapshot === 'function') return snapshot();
            }
            return {};
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

process.stdout.write('__NIXCORD_SLICE_READY__\n');

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

try {
  const payload = JSON.parse(input) as RunnerPayload;
  const sandbox = Object.assign(Object.create(null), {
    IS_DISCORD_DESKTOP: true,
    IS_LINUX: false,
    IS_MAC: false,
    IS_STANDALONE: true,
    IS_UPDATER_DISABLED: true,
    IS_WEB: false,
    IS_WINDOWS: false,
  });
  const context = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    name: 'nixcord-component-slice',
  });
  const source = `(${runSandboxed.toString()})(${JSON.stringify(payload)}, async (__runtime, React) => {\n${payload.code}\n})`;
  const response = await new Script(source, { filename: 'component-slice.js' }).runInContext(
    context
  );
  process.stdout.write(String(response));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      code: 'execution-failed',
      message: error instanceof Error ? error.message : String(error),
      evidence: [],
    })
  );
}
