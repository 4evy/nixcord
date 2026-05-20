<script lang="ts">
  import { prefaceToc } from "../content";
  import TableOfContents from "./TableOfContents.svelte";
  import TitlePage from "./TitlePage.svelte";
</script>

<div class="section">
  <TitlePage id="sec-preface" title="Preface" />
  <TableOfContents items={prefaceToc} />

  <div class="section">
    <TitlePage id="prerequisites" title="Prerequisites" level={2} />
    <p>You'll need a working Nix installation (standalone or NixOS) and Home Manager. Being comfortable with basic Nix syntax will help, though the examples should get you most of the way there</p>
  </div>

  <div class="section">
    <TitlePage id="reporting-issues" title="Reporting Issues" level={2} />
    <p>Found a bug? Check the <a class="link" href="https://github.com/FlameFlag/nixcord/issues">issue tracker</a> first to see if we're already working on it</p>
    <p>If it's new, open a ticket with your config, system info, and logs. The more details you give us, the faster we can fix it</p>
  </div>

  <div class="section">
    <TitlePage id="contributing" title="Contributing" level={2} />
    <p>PRs are always welcome, whether it's for the code or just fixing a typo in the docs</p>
  </div>
</div>
