const shapes = {
 layout:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 history:'<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7"/><path d="M12 7v5l3 2"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
 store:'<path d="M3 10l2-6h14l2 6M4 10v10h16V10M3 10c0 3.1 4.4 3.1 4.5 0 .1 3.1 4.4 3.1 4.5 0 .1 3.1 4.4 3.1 4.5 0 .1 3.1 4.4 3.1 4.5 0M9 20v-5h6v5"/>',
 file:'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7M8 13h8M8 17h6"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.7 2.7 0 0 1 5.2.9c0 1.9-2.6 2.2-2.6 4m0 3h.01"/>',
 menu:'<path d="M3 6h18M3 12h18M3 18h18"/>', calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',chev:'<path d="m9 18 6-6-6-6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',book:'<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1zm0 0v14"/>',
 bulb:'<path d="M9 18c0-2-4-3.5-4-8a7 7 0 1 1 14 0c0 4.5-4 6-4 8zM9 21h6"/>',
 play:'<path d="m9 6 9 6-9 6z"/>', shield:'<path d="m12 2 8 3v6c0 5-5 9-8 11-3-2-8-6-8-11V5z"/><path d="m8 11 3 3 5-5"/>',
 cart:'<path d="M2 3h3l2 12h12l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>', grad:'<path d="m2 9 10-5 10 5-10 5zM6 11v5c4 3 8 3 12 0v-5m4-2v6"/>',
 receipt:'<path d="M5 3l2 2 2-2 3 2 3-2 2 2 2-2v18l-2-2-2 2-3-2-3 2-2-2-2 2zM8 9h8M8 13h6"/>',
 external:'<path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>'
};
export function icon(name) {return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(shapes[name]||'')+'</svg>'}
export function fillIcons(scope=document){for(const el of scope.querySelectorAll('[data-icon]')) el.innerHTML=icon(el.dataset.icon)}
