import { createElement } from 'react';
const css = `
@keyframes soft-appear { from {opacity:0;transform:translateY(6px)} to {opacity:1;transform:none} }
@keyframes panel-appear { from {opacity:0;transform:scale(.98)} to {opacity:1;transform:scale(1)} }
@keyframes menu-appear { from {opacity:0;transform:scale(.86)} to {opacity:1;transform:scale(1)} }
@keyframes skeleton-shimmer { 0% {background-position:-100% 0} 70% {background-position:250% 0} 100% {background-position:250% 0} }
@keyframes stream-appear { 0% {opacity:0} 55% {opacity:1} 100% {opacity:1} }
@keyframes toast-life { 0% {opacity:0;transform:translateY(4px)} 12%,85% {opacity:1;transform:none} 100% {opacity:0;visibility:hidden} }
[data-testid="composer-frame"] {transition:border-color .15s ease,box-shadow .15s ease;}
[data-testid="composer-frame"]:focus-within {box-shadow:0 0 0 1px currentColor;}
[data-testid="composer-frame"] textarea,[data-testid="composer-frame"] textarea:focus,[data-testid="composer-frame"] textarea:focus-visible {
 outline:none!important;outline-width:0!important;outline-style:none!important;box-shadow:none!important;border:0!important;
 field-sizing:content;max-height:200px;overflow-y:auto;
}
[data-testid="skeleton"] {
 background-image:linear-gradient(90deg,transparent 0,rgba(255,255,255,.12) 50%,transparent 100%);
 background-size:200% 100%;animation:skeleton-shimmer 1.4s linear infinite;
}
[data-testid="streaming-text-tail"] {animation:stream-appear .4s linear both;}
[data-testid="nav-icon"] {opacity:.68;transition:opacity .15s ease;}
[role="button"]:hover [data-testid="nav-icon"],[role="button"]:focus-visible [data-testid="nav-icon"] {opacity:1;}
button,[role="button"],[role="menuitem"] {transition:background-color .15s ease,color .15s ease,opacity .15s ease,transform .15s ease;}
button:not(:disabled):active,[role="button"]:not([aria-disabled="true"]):active {transform:scale(.96);}
[data-testid="chat-message"],[data-testid="attachment-card"] {animation:soft-appear .18s cubic-bezier(.2,.8,.2,1);}
[data-testid="dialog-panel"] {animation:panel-appear .18s cubic-bezier(.2,.8,.2,1);}
[data-testid="dropdown-menu"] {animation:menu-appear .22s cubic-bezier(.16,1,.3,1);transform-origin:top left;}
[data-testid="selection-list-item"] {transition:background-color .15s ease,opacity .15s ease,transform .15s ease;}
[data-testid="toast"] {animation:toast-life 2.6s cubic-bezier(.2,.8,.2,1) both;}
[data-testid="action-tooltip"] {animation:soft-appear .12s ease-out;}
[data-testid="dialog-panel"] [role="button"],[data-testid="dropdown-menu"] [role="button"],[data-testid="dropdown-menu"] [role="menuitem"] {border-radius:14px;}
[data-testid="composer-attach"],[data-testid="composer-tools"],[data-testid="composer-model"],[data-testid="composer-send"] {
 position:relative;isolation:isolate;overflow:visible;
}
@media (prefers-reduced-motion:reduce) {
 *,*::before,*::after {animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:0s!important;scroll-behavior:auto!important;}
 [data-testid="toast"] {animation:none!important;opacity:1!important;visibility:visible!important;transform:none!important;}
}
`;
export function WebEffects() {
  return createElement('style', { 'data-ai-chat-effects': 'true' }, css);
}
