import { createElement } from 'react';

const css = `
@keyframes chatgpt-spin {
  to { transform: rotate(360deg); }
}
@keyframes chatgpt-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.28); opacity: 1; }
}
@keyframes chatgpt-shimmer {
  0% { opacity: 0.45; }
  50% { opacity: 0.95; }
  100% { opacity: 0.45; }
}
@keyframes chatgpt-msg-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes chatgpt-panel-enter {
  from { opacity: 0; transform: translateY(6px) scale(0.982); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes chatgpt-menu-enter {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes chatgpt-drawer-enter {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
@keyframes chatgpt-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes chatgpt-tooltip-enter {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

* {
  scrollbar-width: thin;
  scrollbar-color: rgba(142, 142, 142, 0.25) transparent;
}
*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background: rgba(142, 142, 142, 0.25);
  border-radius: 9999px;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgba(142, 142, 142, 0.45);
}

[data-testid="composer-frame"] {
  transition: box-shadow 180ms cubic-bezier(0.2, 0, 0, 1), border-color 180ms cubic-bezier(0.2, 0, 0, 1);
}
[data-testid="composer-frame"] textarea,
[data-testid="composer-frame"] textarea:focus,
[data-testid="composer-frame"] textarea:focus-visible {
  outline: none !important;
  outline-width: 0 !important;
  outline-style: none !important;
  box-shadow: none !important;
  border: 0 !important;
}

button, [role="button"], [role="menuitem"] {
  transition: opacity 140ms ease, transform 120ms ease;
}
button:not(:disabled):active, [role="button"]:not([aria-disabled="true"]):active {
  transform: scale(0.97);
}

[data-testid="chat-message"] {
  animation: chatgpt-msg-enter 220ms cubic-bezier(0.2, 0, 0, 1);
}
[data-testid="attachment-card"] {
  animation: chatgpt-msg-enter 180ms cubic-bezier(0.2, 0, 0, 1);
}
[data-testid="dialog-panel"],
[data-testid="search-modal"],
[data-testid="settings-modal"] {
  animation: chatgpt-panel-enter 170ms cubic-bezier(0.16, 1, 0.3, 1);
}
[data-testid="popover-menu"],
[data-testid="model-popover"] {
  animation: chatgpt-menu-enter 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
[data-testid="drawer-panel"] {
  animation: chatgpt-drawer-enter 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
[data-testid="drawer-backdrop"] {
  animation: chatgpt-fade-in 180ms ease-out;
}
[data-testid="action-tooltip"] {
  animation: chatgpt-tooltip-enter 110ms ease-out;
}
[data-testid="chatgpt-thinking-dot"],
[data-testid="streaming-cursor"] {
  animation: chatgpt-dot-pulse 1.2s ease-in-out infinite;
}
[data-testid="chatgpt-thinking-text"] {
  animation: chatgpt-shimmer 1.6s ease-in-out infinite;
}
[data-testid="chatgpt-spinner-ring"] {
  animation: chatgpt-spin 0.8s linear infinite;
}

[data-testid="sidebar-chat-row"] [data-testid="sidebar-row-more"] {
  opacity: 0;
  transition: opacity 120ms ease;
}
[data-testid="sidebar-chat-row"]:hover [data-testid="sidebar-row-more"],
[data-testid="sidebar-chat-row"]:focus-within [data-testid="sidebar-row-more"],
[data-testid="sidebar-chat-row"][data-active="true"] [data-testid="sidebar-row-more"] {
  opacity: 1;
}

[data-testid="chat-message"] [data-testid="user-message-actions"] {
  opacity: 0;
  transition: opacity 140ms ease;
}
[data-testid="chat-message"]:hover [data-testid="user-message-actions"],
[data-testid="chat-message"]:focus-within [data-testid="user-message-actions"] {
  opacity: 1;
}

@media (hover: none) {
  [data-testid="sidebar-chat-row"] [data-testid="sidebar-row-more"],
  [data-testid="chat-message"] [data-testid="user-message-actions"] {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    scroll-behavior: auto !important;
  }
}
`;

export function WebEffects() {
  return createElement('style', { 'data-ai-chat-effects': 'true' }, css);
}
