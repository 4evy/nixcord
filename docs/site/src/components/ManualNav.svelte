<script lang="ts">
import { onMount } from 'svelte';
import { focusClass } from '../classes';
import { mainToc } from '../content';
import ModeToggle from './ModeToggle.svelte';

let activeHref = $state<string | null>(null);
let navElement = $state<HTMLElement | null>(null);
let navScrollElement = $state<HTMLElement | null>(null);

onMount(() => {
  const updateActiveSection = () => {
    const offset = Math.max((navElement?.offsetHeight ?? 48) + 48, window.innerHeight * 0.4);
    let nextActiveHref: string | null = null;

    for (const item of mainToc) {
      const section = document.getElementById(item.href.slice(1));
      if (section && section.getBoundingClientRect().top <= offset) nextActiveHref = item.href;
    }

    if (activeHref === nextActiveHref) return;

    activeHref = nextActiveHref;
    if (nextActiveHref) requestAnimationFrame(() => keepLinkVisible(nextActiveHref));
  };

  updateActiveSection();
  window.addEventListener('scroll', updateActiveSection, { passive: true });
  window.addEventListener('resize', updateActiveSection);

  return () => {
    window.removeEventListener('scroll', updateActiveSection);
    window.removeEventListener('resize', updateActiveSection);
  };
});

function keepLinkVisible(href: string) {
  const link = Array.from(navScrollElement?.querySelectorAll<HTMLAnchorElement>('a') ?? []).find(
    (candidate) => candidate.getAttribute('href') === href
  );
  if (!link || !navScrollElement) return;

  const navBounds = navScrollElement.getBoundingClientRect();
  const linkBounds = link.getBoundingClientRect();

  if (linkBounds.left < navBounds.left) {
    navScrollElement.scrollLeft -= navBounds.left - linkBounds.left + 8;
  } else if (linkBounds.right > navBounds.right) {
    navScrollElement.scrollLeft += linkBounds.right - navBounds.right + 8;
  }
}
</script>

<header
  bind:this={navElement}
  class="manual-nav sticky top-0 z-40 -mx-4 mb-7 border-y border-neutral-200 bg-white/95 px-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:-mx-10 sm:px-10 lg:-mx-16 lg:px-16 dark:border-neutral-800 dark:bg-[#12171d]/95 dark:shadow-[0_6px_18px_rgba(0,0,0,0.2)]"
>
  <div class="flex h-12 min-w-0 items-center gap-3">
    <a
      class={`shrink-0 rounded-sm font-semibold text-[#0a3e68] no-underline hover:text-[#268598] dark:text-[#8ccff0] dark:hover:text-[#bde8fa] ${focusClass}`}
      href="#nixcord-manual"
    >
      Nixcord
    </a>

    <nav
      bind:this={navScrollElement}
      class="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Manual sections"
    >
      <ul class="m-0 flex min-w-max list-none items-center gap-1 p-0">
        {#each mainToc as item (item.href)}
          <li class="m-0">
            <a
              class={`inline-flex min-h-8 items-center rounded-sm px-2.5 text-[0.84rem] font-medium no-underline transition-colors ${focusClass} ${
                activeHref === item.href
                  ? 'bg-sky-50 text-[#0a3e68] dark:bg-[#1f2b35] dark:text-[#bde8fa]'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-[#0a3e68] dark:text-neutral-400 dark:hover:bg-[#171d24] dark:hover:text-[#8ccff0]'
              }`}
              href={item.href}
              aria-current={activeHref === item.href ? 'location' : undefined}
            >
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <div class="shrink-0">
      <ModeToggle />
    </div>
  </div>
</header>
