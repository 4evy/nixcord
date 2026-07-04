import './styles.css';
import App from './App.svelte';
import { mount } from 'svelte';

document.documentElement.classList.add('scroll-smooth');
document.body.classList.add(
  'm-0',
  'min-h-screen',
  'bg-neutral-100',
  'dark:bg-[#0f1318]',
  'font-sans',
  'text-neutral-950',
  'dark:text-neutral-100',
  'antialiased',
  'leading-[1.55]',
  '[text-rendering:optimizeLegibility]'
);

mount(App, {
  target: document.getElementById('app')!,
});
