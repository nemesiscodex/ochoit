// jsdom lacks the top-layer and animation APIs UI SDK popups call. These stubs
// let popups render in tests; real popup behavior is checked in a browser.
HTMLElement.prototype.showPopover ??= function showPopover() {};
HTMLElement.prototype.hidePopover ??= function hidePopover() {};
HTMLElement.prototype.togglePopover ??= function togglePopover() {
  return true;
};
Element.prototype.getAnimations ??= () => [];

globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

document.head.append(
  Object.assign(document.createElement("style"), {
    textContent: "[popover] { display: block !important }",
  }),
);
