import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no layout or pointer capture; these browser hooks are used by Radix.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!globalThis.PointerEvent) globalThis.PointerEvent = MouseEvent;
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

afterEach(() => cleanup());
