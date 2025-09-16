import { vi } from 'vitest';

// Mock canvas for testing
const mockCanvas = {
  getContext: vi.fn(() => ({
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  })),
  width: 800,
  height: 600,
  style: {},
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock HTMLCanvasElement
Object.defineProperty(global, 'HTMLCanvasElement', {
  value: class HTMLCanvasElement {
    getContext = mockCanvas.getContext;
    width = mockCanvas.width;
    height = mockCanvas.height;
    style = mockCanvas.style;
    addEventListener = mockCanvas.addEventListener;
    removeEventListener = mockCanvas.removeEventListener;
  }
});

// Mock Image
Object.defineProperty(global, 'Image', {
  value: class Image {
    src = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 256;
    naturalHeight = 256;

    constructor() {
      // Simulate successful load
      setTimeout(() => {
        this.complete = true;
        this.naturalWidth = 256;
        this.naturalHeight = 256;
        if (this.onload) this.onload();
      }, 0);
    }
  }
});

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    performance: {
      now: vi.fn(() => Date.now())
    }
  }
});

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    createElement: vi.fn((tagName: string) => {
      if (tagName === 'canvas') {
        return new HTMLCanvasElement();
      }
      if (tagName === 'img') {
        return new Image();
      }
      return {};
    }),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
});

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    getGamepads: vi.fn(() => [])
  }
});
