import { createElement } from 'react';
const css = `
@property --composer-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes composer-colors { to { --composer-angle: 360deg; } }
@keyframes soft-appear { from {opacity:0;transform:translateY(5px)} to {opacity:1;transform:translateY(0)} }
@keyframes panel-appear { from {opacity:0;transform:translateY(6px) scale(.985)} to {opacity:1;transform:translateY(0) scale(1)} }
[data-testid="composer-frame"],[data-testid="sign-in-button"] { position:relative; isolation:isolate; overflow:visible; }
[data-testid="composer-frame"] { transition:border-color .24s,box-shadow .24s; }
[data-testid="composer-frame"]::before,[data-testid="sign-in-button"]::before {
 content:'';position:absolute;inset:-1px;padding:1.5px;border-radius:inherit;pointer-events:none;
 background:conic-gradient(from var(--composer-angle),#8ab4f8,#b69df8,#e9a3c9,#f4c789,#a8d8b9,#8ab4f8);
 -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
 -webkit-mask-composite:xor;mask-composite:exclude;
 opacity:.72;transition:opacity .24s;animation:composer-colors 6s linear infinite;animation-play-state:running;
}
[data-testid="composer-frame"]:focus-within::before {opacity:1;animation-play-state:running;}
[data-testid="sign-in-button"]::before {
 inset:-4px;padding:3.5px;opacity:1;
 background:conic-gradient(from var(--composer-angle),#6aa6ff,#c49bff,#ff8fbf,#ffc85a,#7ad9a4,#6aa6ff);
}
[data-testid="composer-frame"] textarea,[data-testid="composer-frame"] textarea:focus,[data-testid="composer-frame"] textarea:focus-visible {
 outline:none!important;outline-width:0!important;outline-style:none!important;box-shadow:none!important;border:0!important;
}
[data-testid="nav-icon"] {opacity:.68;transition:opacity .16s ease;}
[role="button"]:hover [data-testid="nav-icon"],[role="button"]:focus-visible [data-testid="nav-icon"] {opacity:1;}
button,[role="button"],[role="menuitem"] {transition:background-color .16s ease,color .16s ease,opacity .16s ease,transform .16s ease;}
button:not(:disabled):active,[role="button"]:not([aria-disabled="true"]):active {transform:scale(.96);}
[data-testid="chat-message"],[data-testid="attachment-card"] {animation:soft-appear .22s ease-out;}
[data-testid="dialog-panel"],[data-testid="toast"] {animation:panel-appear .22s ease-out;}
[data-testid="action-tooltip"] {animation:soft-appear .12s ease-out;}
@media (prefers-reduced-motion:reduce) {
 *,*::before,*::after {animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:0s!important;scroll-behavior:auto!important;}
}
`;
export function WebEffects() {
  return createElement('style', { 'data-ai-chat-effects': 'true' }, css);
}
