<script lang="ts">
import BookOpen from '@lucide/svelte/icons/book-open';
import Terminal from '@lucide/svelte/icons/terminal';
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import ExternalLink from '@lucide/svelte/icons/external-link';
import { onMount } from 'svelte';
import { focusClass } from '../classes';
import { introductionToc, mainToc, prefaceToc } from '../content';
import ModeToggle from './ModeToggle.svelte';

const navLinkClass = `flex items-center gap-2 rounded-md px-2.5 whitespace-nowrap text-muted hover:bg-panel hover:text-ink aria-[current=location]:bg-selected aria-[current=location]:font-semibold aria-[current=location]:text-accent lg:my-0.5 lg:whitespace-normal ${focusClass}`;

const sectionIcons = [SlidersHorizontal, ArrowLeftRight, BookOpen, Terminal];

let activeHref = $state<string | null>(null);
let navElement = $state<HTMLElement | null>(null);
let navScrollElement = $state<HTMLElement | null>(null);

onMount(() => {
  const updateActiveSection = () => {
    const offset = window.innerWidth >= 1024 ? 160 : (navElement?.offsetHeight ?? 64) + 48;
    let nextActiveHref: string | null = null;
    let activeTop = -Infinity;
    // A short final section cannot always reach the usual activation offset
    const atBottom =
      window.scrollY > 0 &&
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const activationOffset = atBottom ? window.innerHeight : offset;

    const items =
      window.innerWidth < 1024
        ? mainToc
        : mainToc.flatMap((item) => [
            item,
            ...(item.href === '#sec-preface'
              ? prefaceToc
              : item.href === '#sec-introduction'
                ? introductionToc
                : []),
          ]);
    for (const item of items) {
      const section = document.getElementById(item.href.slice(1));
      if (!section) continue;
      const top = section.getBoundingClientRect().top;
      // Navigation priority can differ from the document's reading order
      if (top <= activationOffset && top > activeTop) {
        activeTop = top;
        nextActiveHref = item.href;
      }
    }

    if (activeHref === nextActiveHref) return;

    activeHref = nextActiveHref;
    if (nextActiveHref) requestAnimationFrame(() => keepLinkVisible(nextActiveHref));
  };

  updateActiveSection();
  window.addEventListener('scroll', updateActiveSection, { passive: true });
  window.addEventListener('resize', updateActiveSection);
  const resizeObserver = new ResizeObserver(updateActiveSection);
  resizeObserver.observe(document.getElementById('content') ?? document.body);

  return () => {
    window.removeEventListener('scroll', updateActiveSection);
    window.removeEventListener('resize', updateActiveSection);
    resizeObserver.disconnect();
  };
});

function keepLinkVisible(href: string) {
  const link = Array.from(navScrollElement?.querySelectorAll<HTMLAnchorElement>('a') ?? []).find(
    (candidate) => candidate.getAttribute('href') === href
  );
  if (!link || !navScrollElement) return;

  const navBounds = navScrollElement.getBoundingClientRect();
  const linkBounds = link.getBoundingClientRect();

  if (window.innerWidth >= 1024) {
    if (linkBounds.top < navBounds.top) {
      navScrollElement.scrollTop -= navBounds.top - linkBounds.top + 8;
    } else if (linkBounds.bottom > navBounds.bottom) {
      navScrollElement.scrollTop += linkBounds.bottom - navBounds.bottom + 8;
    }
  } else if (linkBounds.left < navBounds.left) {
    navScrollElement.scrollLeft -= navBounds.left - linkBounds.left + 8;
  } else if (linkBounds.right > navBounds.right) {
    navScrollElement.scrollLeft += linkBounds.right - navBounds.right + 8;
  }
}
</script>

<header
  bind:this={navElement}
  data-manual-nav
  class="sticky top-0 z-40 border-b border-line bg-page lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0"
>
  <div class="flex items-center justify-between gap-3 px-5 py-2.5 sm:py-4 lg:py-7">
    <a
      class={`flex items-center gap-2 text-lg font-semibold tracking-tight ${focusClass}`}
      href="#nixcord-manual"
    >
      <img src={`${import.meta.env.BASE_URL}nixcord-logo.svg`} alt="" width="25" height="25">
      Nixcord <span class="text-xs font-normal tracking-normal text-muted">docs</span>
    </a>
    <ModeToggle />
  </div>
  <nav
    bind:this={navScrollElement}
    class="overflow-x-auto px-3 pb-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-3.5 lg:py-4"
    aria-label="Manual sections"
  >
    <p class="mx-2.5 mb-3.5 hidden text-xs font-semibold lg:block">Documentation</p>
    <ul class="flex list-none gap-1 lg:block">
      {#each mainToc as item, index (item.href)}
        {@const Icon = sectionIcons[index]}
        <li>
          <a
            class={`${navLinkClass} py-2 text-[13px]`}
            href={item.href}
            aria-current={activeHref === item.href ? 'location' : undefined}
          >
            <Icon class="shrink-0" size={16} aria-hidden="true" />
            {item.label}
          </a>
          {#if item.href === '#sec-preface' || item.href === '#sec-introduction'}
            <ul class="mt-1 mb-4 ml-4 hidden border-l border-line pl-2 lg:block">
              {#each item.href === '#sec-preface'
                ? prefaceToc
                : introductionToc as child (child.href)}
                <li>
                  <a
                    class={`${navLinkClass} py-1.5 text-xs`}
                    href={child.href}
                    aria-current={activeHref === child.href ? 'location' : undefined}
                  >
                    {child.label}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </nav>
  <a
    class={`hidden items-center gap-2 px-6 py-5 text-[13px] text-muted hover:text-accent lg:flex ${focusClass}`}
    href="https://github.com/4evy/nixcord"
    >GitHub <ExternalLink size={15} aria-hidden="true" /></a
  >
</header>
