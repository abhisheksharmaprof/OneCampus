import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const storageMock: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true })
  }
}

// Mock HTMLCanvasElement for headless JSDOM testing
if (typeof window !== 'undefined' && typeof window.HTMLCanvasElement !== 'undefined') {
  const originalGetContext = window.HTMLCanvasElement.prototype.getContext
  window.HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: any[]) {
    if (contextId === '2d') {
      return {
        canvas: this,
        drawImage: () => {},
        getImageData: (_sx: number, _sy: number, sw: number, sh: number) => ({
          data: new Uint8ClampedArray(sw * sh * 4),
          width: sw,
          height: sh,
        }),
        putImageData: () => {},
        clearRect: () => {},
        fillRect: () => {},
      } as unknown as CanvasRenderingContext2D
    }
    return originalGetContext ? originalGetContext.apply(this, [contextId, ...args] as any) : null
  } as any

  window.HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  }
}

afterEach(() => {
  cleanup()
  globalThis.localStorage?.clear()
})
