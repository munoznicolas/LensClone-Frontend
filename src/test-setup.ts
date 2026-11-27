import { afterEach, vi } from 'vitest';

// Worker-wide onnxruntime-web mock so non-isolated spec files share one constructible Tensor/session mock.
vi.mock('onnxruntime-web', () => {
  const ORT_MOCK_KEY = Symbol.for('lens-clone:ort-mock');
  const globalStore = globalThis as Record<PropertyKey, unknown>;

  if (!globalStore[ORT_MOCK_KEY]) {
    class TensorMock {
      constructor(
        public readonly type: string,
        public readonly data: ArrayBufferView | number[],
        public readonly dims: readonly number[],
      ) {}
    }

    const createMock = vi.fn().mockResolvedValue({
      outputNames: ['out'],
      run: vi.fn().mockResolvedValue({ out: {} }),
    });

    globalStore[ORT_MOCK_KEY] = {
      env: {
        logLevel: 'error',
        wasm: { numThreads: 4, proxy: false, logLevel: 'error', wasmPaths: '/assets/ort/' },
      },
      InferenceSession: { create: createMock },
      Tensor: TensorMock,
    };
  }

  const mock = globalStore[ORT_MOCK_KEY] as Record<string, unknown>;
  return {
    __esModule: true,
    default: mock,
    ...mock,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
    localStorage.clear();
  }
  if (typeof sessionStorage !== 'undefined' && typeof sessionStorage.clear === 'function') {
    sessionStorage.clear();
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = '';
  }
  if (typeof window !== 'undefined' && window.location?.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
});
