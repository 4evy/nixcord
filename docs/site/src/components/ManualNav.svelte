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

const sectionIcons = [SlidersHorizontal, ArrowLeftRight, BookOpen, Terminal];

let activeHref = $state<string | null>(null);
let navElement = $state<HTMLElement | null>(null);
let navScrollElement = $state<HTMLElement | null>(null);

onMount(() => {
  const updateActiveSection = () => {
    const offset = window.innerWidth >= 1024 ? 160 : (navElement?.offsetHeight ?? 64) + 48;
    let nextActiveHref: string | null = null;
    let activeTop = -Infinity;
    // A short final section cannot always reach the usual activation offset.
    const atBottom = window.scrollY > 0 &&
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
      // Navigation priority can differ from the document's reading order.
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

<header bind:this={navElement} class="manual-nav">
  <div class="nav-brand">
    <a class={`brand ${focusClass}`} href="#nixcord-manual">
      <img src={`${import.meta.env.BASE_URL}nixcord-logo.svg`} alt="" width="30" height="30" />
      Nixcord <span>docs</span>
    </a>
    <ModeToggle />
  </div>
  <nav bind:this={navScrollElement} class="section-navigation" aria-label="Manual sections">
    <p class="nav-label">Documentation</p>
    <ul>
      {#each mainToc as item, index (item.href)}
        {@const Icon = sectionIcons[index]}
        <li>
          <a class={`nav-link ${focusClass}`} class:active={activeHref === item.href}
            href={item.href} aria-current={activeHref === item.href ? 'location' : undefined}>
            <Icon size={16} aria-hidden="true" />
            {item.label}
          </a>
          {#if item.href === '#sec-preface' || item.href === '#sec-introduction'}
            <ul class="nav-children">
              {#each item.href === '#sec-preface' ? prefaceToc : introductionToc as child (child.href)}
                <li><a class={`nav-link ${focusClass}`} class:active={activeHref === child.href}
                  href={child.href} aria-current={activeHref === child.href ? 'location' : undefined}>
                  {child.label}
                </a></li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </nav>
  <a class={`nav-source ${focusClass}`} href="https://github.com/4evy/nixcord">GitHub <ExternalLink size={15} aria-hidden="true" /></a>
</header>
