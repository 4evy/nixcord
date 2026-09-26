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

<section class="parser-example" aria-labelledby="parser-example-title">
  <h4 id="parser-example-title">Example: preserve an enum's values</h4>
  <p class={paragraphClass}>
    IgnoreActivities stores its list mode as <code class={literalCodeClass}>0</code> or
    <code class={literalCodeClass}>1</code>. Reading the TypeScript expression as text would
    generate a string option instead. Here's where that mistake happens and how to fix it.
  </p>

  <figure class="upstream-source">
    <a class={`source-link ${linkClass}`} href="https://github.com/Vendicated/Vencord/blob/90aea0ddbbfbee16ce052b2c7ab610ffe957b4ca/src/plugins/ignoreActivities/index.tsx#L184-L204">Upstream: IgnoreActivities</a>
    <CodeBlock code={upstream} language="typescript" />
    <figcaption class="source-caption">TypeScript assigns <code>Whitelist = 0</code> and <code>Blacklist = 1</code>.
      The first entry's <code>default: true</code> selects <code>0</code> as the default.</figcaption>
  </figure>

  <div class="comparison">
    <section aria-labelledby="parser-before">
      <h5 id="parser-before">Before <span>Read the source text</span></h5>
      <div class="reader-code"><CodeBlock code={before} language="typescript" /></div>
      <div class="value-result incorrect">
        <span class="result-label">Returns a string</span>
        <code>"FilterMode.Whitelist"</code>
      </div>
      <p>The enum name survives into the generated option. Nix then rejects <code>listMode = 0</code>,
        even though that is a valid Vencord setting.</p>
    </section>
    <section aria-labelledby="parser-after">
      <h5 id="parser-after">After <span>Resolve the value</span></h5>
      <div class="reader-code"><CodeBlock code={after} language="typescript" /></div>
      <div class="value-result correct">
        <span class="result-label">Returns a number</span>
        <code>0</code>
      </div>
      <p>Use the parser's <a class={`link ${linkClass}`} href={`${sourceRoot}packages/parser/src/parse-plugins.ts`}>scalarFromNode</a>
        helper. It evaluates the expression and leaves unresolved values out instead of substituting their names.</p>
    </section>
  </div>

  <h5 class="flow-heading">How the value reaches Nix</h5>
  <dl class="value-flow">
    <div>
      <dt>Resolve</dt>
      <dd>
        <div class="resolution"><code>FilterMode.Whitelist</code><span aria-hidden="true">→</span><code>EnumMember</code><span aria-hidden="true">→</span><strong><code>0</code></strong></div>
        <p><a class={`link ${linkClass}`} href={`${sourceRoot}packages/ast/src/evaluator.ts`}>StaticEvaluator</a>
          follows the property access to its enum declaration and reads the member's constant value.</p>
      </dd>
    </div>
    <div>
      <dt>Collect</dt>
      <dd>
        <code>enumValues: [0, 1], default: 0</code>
        <p><a class={`link ${linkClass}`} href={`${sourceRoot}packages/parser/src/setting-rules.ts`}>selectRule</a>
          collects the dropdown values and selected default.
          The <a class={`link ${linkClass}`} href={`${sourceRoot}packages/nix-generator/src/generator.ts`}>JSON generator</a>
          preserves them as numbers.</p>
      </dd>
    </div>
    <div>
      <dt>Declare</dt>
      <dd>
        <div class="nix-result"><CodeBlock code={nix} /></div>
        <p><a class={`link ${linkClass}`} href={`${sourceRoot}modules/plugins/mkPluginOptions.nix`}>mkPluginOptions.nix</a>
          uses those fields to declare <code>config.plugins.ignoreActivities.listMode</code>.
          Now <code>listMode = 0</code> is accepted.</p>
      </dd>
    </div>
  </dl>

  <p class={`verify ${paragraphClass}`}>Check the generated option's choices and default, not just whether the plugin was found.
    Run <code class={literalCodeClass}>npm test</code> and <code class={literalCodeClass}>npm run test:upstream</code>;
    include the affected option and results in your pull request.</p>
</section>

<style>
  .parser-example {
    --example-line: #d9dee5;
    --example-muted: #606b78;
    margin-top: 1.75rem;
    min-width: 0;
    container-type: inline-size;
  }
  h4 { margin: 0 0 .75rem; font-size: 1.12rem; font-weight: 650; }
  h5 { margin: 0; font-size: .95rem; font-weight: 650; }
  h5 span { display: block; margin-top: .3rem; color: var(--example-muted); font-weight: 400; }
  .upstream-source { margin: 1.4rem 0 1.7rem; }
  .source-link { font-size: .85rem; }
  .source-caption { margin: .5rem 0 0; color: var(--example-muted); font-size: .85rem; }
  .upstream-source :global(pre) { margin: .6rem 0; }
  .comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; border-block: 1px solid var(--example-line); padding-block: 1.2rem; }
  .comparison section { display: grid; grid-template-rows: auto 1fr auto auto; min-width: 0; }
  .comparison p { margin: .8rem 0 0; font-size: .9rem; line-height: 1.65; }
  .reader-code { margin: .75rem 0; }
  .reader-code :global(pre), .nix-result :global(pre) { margin: 0; border: 0; background: transparent; border-radius: 0; box-shadow: none; font-size: .78rem; }
  .reader-code :global(pre > code), .nix-result :global(pre > code) { padding: 0; }
  .reader-code :global(pre > code) { white-space: pre-wrap; overflow-wrap: anywhere; }
  .value-result { border-left: 2px solid; padding: .45rem .7rem; }
  .incorrect { border-color: #b0523f; background: #b0523f08; }
  .correct { border-color: #328473; background: #32847308; }
  .result-label { display: block; font-size: .75rem; color: var(--example-muted); margin-bottom: .2rem; }
  .value-result > code { font-size: .85rem; overflow-wrap: anywhere; }
  .flow-heading { margin-top: 1.6rem; }
  .value-flow { margin: .3rem 0 0; }
  .value-flow > div { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr); gap: 1rem; padding: 1rem 0; }
  .value-flow > div + div { border-top: 1px solid var(--example-line); }
  dt { color: var(--example-muted); font-size: .82rem; padding-top: .1rem; }
  dd { min-width: 0; margin: 0; font-size: .88rem; }
  dd p { margin: .45rem 0 0; line-height: 1.65; }
  .resolution { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .resolution > span { color: var(--example-muted); }
  .verify { border-top: 1px solid var(--example-line); padding-top: 1rem; font-size: .9rem; }
  :global(.dark) .parser-example { --example-line: #343c46; --example-muted: #a3adb9; }
  @container (max-width: 640px) {
    .comparison { grid-template-columns: 1fr; gap: 1.2rem; }
    .comparison section + section { border-top: 1px solid var(--example-line); padding-top: 1.2rem; }
    .value-flow > div { grid-template-columns: 1fr; gap: .35rem; }
  }
</style>
