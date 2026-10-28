<script lang="ts">
import { linkClass, literalCodeClass, paragraphClass } from '../classes';
import CodeBlock from './CodeBlock.svelte';

const sourceRoot = 'https://github.com/4evy/nixcord/blob/main/';
const upstream = `const enum FilterMode { Whitelist, Blacklist }

// Inside listMode.options:
{ value: FilterMode.Whitelist, default: true },
{ value: FilterMode.Blacklist }`;
const before = `const value = valueNode.getText();`;
const after = `const value = scalarFromNode(
  valueNode,
  context.evaluator,
  context.profile
);
if (value === undefined) return undefined;`;
const nix = `type = lib.types.enum [ 0 1 ];
default = 0;`;
</script>

<section class="@container/parser mt-7 min-w-0" aria-labelledby="parser-example-title">
  <h4 id="parser-example-title" class="mb-3 text-lg font-semibold">
    Example: preserve an enum's values
  </h4>
  <p class={paragraphClass}>
    IgnoreActivities stores its list mode as <code class={literalCodeClass}>0</code> or
    <code class={literalCodeClass}>1</code>. Reading the TypeScript expression as text would
    generate a string option instead. Here's where that mistake happens and how to fix it.
  </p>

  <figure class="my-6">
    <a
      class={`text-sm ${linkClass}`}
      href="https://github.com/Vendicated/Vencord/blob/90aea0ddbbfbee16ce052b2c7ab610ffe957b4ca/src/plugins/ignoreActivities/index.tsx#L184-L204"
      >Upstream: IgnoreActivities</a
    >
    <CodeBlock code={upstream} language="typescript" />
    <figcaption class="mt-2 text-sm text-muted">
      TypeScript assigns <code>Whitelist = 0</code> and <code>Blacklist = 1</code>. The first
      entry's <code>default: true</code> selects <code>0</code> as the default.
    </figcaption>
  </figure>

  <div class="grid items-start gap-6 border-y border-line py-5 @min-[40rem]/parser:grid-cols-2">
    <section class="min-w-0" aria-labelledby="parser-before">
      <h5 id="parser-before" class="text-sm font-semibold">
        Before <span class="mt-1 block font-normal text-muted">Read the source text</span>
      </h5>
      <CodeBlock code={before} language="typescript" wrap />
      <p class="border-l-2 border-red-700 bg-red-700/5 px-3 py-2 dark:border-red-400">
        <span class="mb-1 block text-xs text-muted">Returns a string</span>
        <code class="text-sm wrap-anywhere">"FilterMode.Whitelist"</code>
      </p>
      <p class="mt-3 text-sm/[1.65]">
        The enum name survives into the generated option. Nix then rejects
        <code>listMode = 0</code>, even though that is a valid Vencord setting.
      </p>
    </section>
    <section
      class="min-w-0 border-t border-line pt-5 @min-[40rem]/parser:border-0 @min-[40rem]/parser:pt-0"
      aria-labelledby="parser-after"
    >
      <h5 id="parser-after" class="text-sm font-semibold">
        After <span class="mt-1 block font-normal text-muted">Resolve the value</span>
      </h5>
      <CodeBlock code={after} language="typescript" wrap />
      <p class="border-l-2 border-emerald-700 bg-emerald-700/5 px-3 py-2 dark:border-emerald-400">
        <span class="mb-1 block text-xs text-muted">Returns a number</span>
        <code class="text-sm">0</code>
      </p>
      <p class="mt-3 text-sm/[1.65]">
        Use the parser's
        <a class={`${linkClass}`} href={`${sourceRoot}packages/parser/src/settings/infer.ts`}
          >scalarFromNode</a
        >
        helper. It evaluates the expression and leaves unresolved values out instead of substituting
        their names.
      </p>
    </section>
  </div>

  <h5 class="mt-6 text-sm font-semibold">How the value reaches Nix</h5>
  <dl class="mt-1 divide-y divide-line">
    <div
      class="grid gap-1.5 py-4 @min-[40rem]/parser:grid-cols-[4.6rem_minmax(0,1fr)] @min-[40rem]/parser:gap-4"
    >
      <dt class="pt-0.5 text-[13px] text-muted">Resolve</dt>
      <dd class="min-w-0 text-sm [&>p]:mt-2 [&>p]:leading-relaxed">
        <p class="flex flex-wrap items-center gap-2 text-muted">
          <code>FilterMode.Whitelist</code><span aria-hidden="true">→</span><code>EnumMember</code
          ><span aria-hidden="true">→</span><strong class="text-ink"><code>0</code></strong>
        </p>
        <p>
          <a
            class={`${linkClass}`}
            href={`${sourceRoot}packages/typescript-analysis/src/evaluator.ts`}
            >StaticEvaluator</a
          >
          follows the property access to its enum declaration and reads the member's constant value.
        </p>
      </dd>
    </div>
    <div
      class="grid gap-1.5 py-4 @min-[40rem]/parser:grid-cols-[4.6rem_minmax(0,1fr)] @min-[40rem]/parser:gap-4"
    >
      <dt class="pt-0.5 text-[13px] text-muted">Collect</dt>
      <dd class="min-w-0 text-sm [&>p]:mt-2 [&>p]:leading-relaxed">
        <code>enumValues: [0, 1], default: 0</code>
        <p>
          <a class={`${linkClass}`} href={`${sourceRoot}packages/parser/src/settings/rules.ts`}
            >selectRule</a
          >
          collects the dropdown values and selected default. The
          <a class={`${linkClass}`} href={`${sourceRoot}packages/nix-generator/src/generator.ts`}
            >JSON generator</a
          >
          preserves them as numbers.
        </p>
      </dd>
    </div>
    <div
      class="grid gap-1.5 py-4 @min-[40rem]/parser:grid-cols-[4.6rem_minmax(0,1fr)] @min-[40rem]/parser:gap-4"
    >
      <dt class="pt-0.5 text-[13px] text-muted">Declare</dt>
      <dd class="min-w-0 text-sm [&>p]:mt-2 [&>p]:leading-relaxed">
        <CodeBlock code={nix} />
        <p>
          The
          <a class={`${linkClass}`} href={`${sourceRoot}packages/cli/src/runner/schema.ts`}
            >option compiler</a
          >
          uses those fields to generate the declaration for
          <code>config.plugins.ignoreActivities.listMode</code>. The Nix module imports that
          declaration. Now <code>listMode = 0</code> is accepted.
        </p>
      </dd>
    </div>
  </dl>

  <p class={`border-t border-line pt-4 text-sm ${paragraphClass}`}>
    Check the generated option's choices and default, not just whether the plugin was found. Run
    <code class={literalCodeClass}>bun run test</code>
    and
    <code class={literalCodeClass}>bun run test:upstream</code>; include the affected option and
    results in your pull request.
  </p>
</section>
