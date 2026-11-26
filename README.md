# LensClone 🔍

> A Proof-of-Concept (PoC) web application inspired by **Google Lens**. It runs real-time computer vision, text detection (DBNet), character recognition (CRNN/OCR), line grouping, and offer extraction directly inside the browser using **Angular 22**, **ONNX Runtime Web (WASM)**, and Web Workers.

---

## 🌟 Key Features

- 📹 **Real-Time Camera Viewport**: High-performance WebRTC camera feed processing with `requestAnimationFrame` loop guarding and hardware torch control.
- 🎯 **DBNet Text Detection**: ONNX WASM neural network for detecting multi-oriented text bounding boxes in live video frames.
- 🔤 **CRNN Text Recognition (OCR)**: Convolutional Recurrent Neural Network for character recognition with CTC greedy decoding.
- 🏷️ **Line Grouping & Offer Structuring**: Merges horizontal text bounding boxes into reading lines and structured product offers.
- ⚡ **Web Worker & Buffer Pooling**: Offloads heavy ONNX WASM model inference to background Web Workers ([pipeline.worker.ts](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/pipeline.worker.ts)) and uses Float32Array buffer pooling ([TensorBufferPoolService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/tensor-buffer-pool/tensor-buffer-pool.service.ts)) to eliminate Garbage Collection lag.
- 🛠️ **Interactive Debug Diagnostics**: Built-in diagnostics drawer for inspecting sub-canvas crop previews, toggling visual overlay stages, monitoring FPS, and measuring stage latency.
- 💾 **Local Scan History**: Tracks snapshot captures, detection counts, and recognized text snippets with offline `localStorage` persistence.
- 🔐 **Google Auth Session**: Simulated Google OAuth user profile management with Angular Signals state.

---

## 🏗️ Architecture & Codebase Structure

The project follows a modular co-located documentation structure where features and service suites maintain localized `README.md` files:

```text
src/
├── app/
│   ├── app.ts                  # Root standalone component
│   ├── app.config.ts           # Application config (providers, routing)
│   ├── app.routes.ts           # Application routes
│   ├── features/               # Feature Components
│   │   ├── debug/              # Diagnostics panel & crop sub-canvases (README.md)
│   │   ├── lens/               # Main camera feed & pipeline loop view (README.md)
│   │   └── overlay/            # Canvas overlay for detected text & lines (README.md)
│   └── services/               # Core Services & Vision Pipeline
│       ├── auth/               # User auth state & persistence (README.md)
│       ├── camera/             # WebRTC camera access & torch control (README.md)
│       ├── history/            # Scan history tracking & local storage (README.md)
│       ├── pipeline/           # Vision pipeline orchestrator & Web Worker (README.md)
│       ├── text-detection/     # ML models (DBNet/CRNN), cropping, tracking, OCR, line grouping (README.md)
│       └── visualization/      # 2D Canvas rendering for bounding boxes & lines (README.md)
public/                         # Static assets and ONNX WASM model files
```

---

## 💻 Technical Stack

- **Framework**: [Angular 22](https://angular.dev/) (Standalone Components, Signals, New Control Flow)
- **Language**: [TypeScript ~6.0](https://www.typescriptlang.org/)
- **ML / Vision Inference Engine**: [`onnxruntime-web`](https://onnxruntime.ai/) (WebAssembly & WebGPU backend)
- **Testing**: [Vitest](https://vitest.dev/) with `jsdom` via `ng test`
- **Formatting & Style**: Prettier, Vanilla CSS / Angular Scoped CSS

---

## 🚀 Quick Start

### Prerequisites
- Node.js `^20.0.0` or higher
- npm `^10.0.0` or higher

### Installation & Development

```bash
# Install dependencies
npm install

# Start local dev server
npm start
```

Navigate to `http://localhost:4200/` in your browser and allow camera access when prompted.

For first-time backend and Google OAuth configuration, see [First-Time Configuration Runbook](docs/FIRST_TIME_SETUP_RUNBOOK.md).

---

## 🧪 Commands Reference

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm start` or `ng serve` | **Start Dev Server** | Runs local server at `http://localhost:4200/` |
| `npm test` or `ng test` | **Run Unit Tests** | Executes Vitest test suite |
| `npm run build` or `ng build` | **Production Build** | Compiles optimized production bundle to `dist/` |
| `npm run watch` | **Watch Build** | Builds continuously in watch mode |

---

## 📚 Modular Documentation Links

For deeper architectural context on individual modules, consult the co-located documentation:
- [Lens Feature Component](file:///d:/Repositories/PoC-LensClone/src/app/features/lens/README.md)
- [Debug Diagnostics Feature](file:///d:/Repositories/PoC-LensClone/src/app/features/debug/README.md)
- [Overlay Canvas Feature](file:///d:/Repositories/PoC-LensClone/src/app/features/overlay/README.md)
- [Vision Processing Pipeline](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/README.md)
- [Text Detection & OCR Suite](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/README.md)
- [Camera Service](file:///d:/Repositories/PoC-LensClone/src/app/services/camera/README.md)
- [Visualization Renderer](file:///d:/Repositories/PoC-LensClone/src/app/services/visualization/README.md)
- [Scan History Service](file:///d:/Repositories/PoC-LensClone/src/app/services/history/README.md)
- [Auth Service](file:///d:/Repositories/PoC-LensClone/src/app/services/auth/README.md)
