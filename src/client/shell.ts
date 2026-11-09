// Shared page chrome: a slim top bar and the bottom tab bar.
import type { Lang } from '../types.ts';
import { el, getMe, t } from './api.ts';

export type PageId = 'talk' | 'agenda' | 'history' | 'settings';
const TABS: { id: PageId; href: string; icon: string; en: string; idn: string }[] = [
  { id: 'talk', href: '/', icon: '🐱', en: 'Talk', idn: 'Bicara' },
  { id: 'agenda', href: '/agenda', icon: '📅', en: 'Agenda', idn: 'Agenda' },
  { id: 'history', href: '/history', icon: '💬', en: 'History', idn: 'Riwayat' },
  { id: 'settings', href: '/settings', icon: '⚙️', en: 'Settings', idn: 'Pengaturan' },
];

export async function mountShell(active: PageId): Promise<Lang> {
  const nav = el('nav', 'tabs');
  nav.setAttribute('aria-label', 'Main');
  const top = el('header', 'top');
  const brand = el('a', 'brand'); brand.href = '/'; brand.append(el('span', 'brand-cat', '🐱'), el('b', null, 'Mochi'), el('small', null, 'Context Assistant'));
  const who = el('img', 'who'); who.alt = '';
  top.append(brand, who);
  document.body.prepend(top);
  document.body.append(nav);

  let lang: Lang = 'en';
  try {
    const me = await getMe();
    lang = me.profile.language;
    if (me.user.picture) { who.src = me.user.picture; who.title = me.user.email ?? ''; } else who.remove();
  } catch { who.remove(); }
  document.documentElement.lang = lang;
  for (const tab of TABS) {
    const a = el('a', tab.id === active ? 'tab active' : 'tab');
    a.href = tab.href;
    if (tab.id === active) a.setAttribute('aria-current', 'page');
    a.append(el('span', 'tab-icon', tab.icon), el('span', null, t(lang, tab.en, tab.idn)));
    nav.append(a);
  }
  return lang;
}
