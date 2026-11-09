import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CameraService } from '../../services/camera/camera.service';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { HistoryService, HistoryItem } from '../../services/history/history.service';
import { AuthService } from '../../services/auth/auth.service';
import { DeviceService } from '../../services/device/device.service';
import { OverlayComponent } from '../overlay/overlay.component';
import { SettingsComponent } from '../settings/settings.component';
import { ShoppingListComponent } from '../shopping-list/shopping-list.component';
import { PriceApiService } from '../../services/backend/price-api.service';
import { isOfferComplete } from '../../services/text-detection/detection-helper/detection-helpers';

export type ModalType =
  | 'none'
  | 'menu'
  | 'history'
  | 'shoppingList'
  | 'feedback'
  | 'permissions'
  | 'privacy'
  | 'terms'
  | 'account';

@Component({
  selector: 'app-lens',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayComponent, SettingsComponent, ShoppingListComponent],
  templateUrl: './lens.component.html',
  styleUrl: './lens.component.css',
})
export class LensComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video', { static: true })
  private videoElement!: ElementRef<HTMLVideoElement>;

  @Output() openDebug = new EventEmitter<void>();

  readonly videoWidth = signal(0);
  readonly videoHeight = signal(0);

  readonly isFrozen = signal(false);
  readonly isTorchOn = signal(false);
  readonly isTorchSupported = signal(false);

  readonly activeModal = signal<ModalType>('none');
  readonly selectedHistoryItem = signal<HistoryItem | null>(null);

  readonly sheetSnap = signal<'collapsed' | 'peek' | 'half' | 'full'>('peek');
  readonly actionNotification = signal<string | null>(null);

  readonly feedbackText = signal('');
  readonly feedbackRating = signal(5);
  readonly feedbackSubmitted = signal(false);

  private readonly captureCanvas = document.createElement('canvas');
  private readonly captureContext = this.captureCanvas.getContext('2d', {
    willReadFrequently: true,
  })!;

  private detectionInProgress = false;
  private animationFrameId?: number;
  private isDestroyed = false;

  // Fingerprint cooldown map: <fingerprint, timestampMs> (5-minute cooldown)
  private readonly submittedFingerprints = new Map<string, number>();
  private readonly SUBMISSION_COOLDOWN_MS = 5 * 60 * 1000;

  constructor(
    private readonly cameraService: CameraService,
    readonly pipelineService: PipelineService,
    private readonly priceApiService: PriceApiService,
    readonly historyService: HistoryService,
    readonly authService: AuthService,
    readonly deviceService: DeviceService,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    this.isDestroyed = false;
    try {
      await this.cameraService.start(this.videoElement.nativeElement);

      if (this.videoElement.nativeElement.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve) => {
          this.videoElement.nativeElement.onloadedmetadata = () => resolve();
        });
      }

      this.videoWidth.set(this.videoElement.nativeElement.videoWidth || 640);
      this.videoHeight.set(this.videoElement.nativeElement.videoHeight || 480);
      this.resizeCanvases(this.videoElement.nativeElement);

      this.isTorchSupported.set(this.cameraService.hasTorch(this.videoElement.nativeElement));

      await this.pipelineService.initialize();
      this.runDetectionLoop();
    } catch (err) {
      console.warn('Failed to start camera or pipeline in LensComponent:', err);
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    if (this.videoElement?.nativeElement) {
      this.cameraService.stop?.(this.videoElement.nativeElement);
    }
  }

  async toggleTorch(): Promise<void> {
    if (!this.isTorchSupported()) return;
    const targetState = !this.isTorchOn();
    const success = await this.cameraService.toggleTorch(
      this.videoElement.nativeElement,
      targetState,
    );
    if (success) {
      this.isTorchOn.set(targetState);
    }
  }

  private frozenImageData: ImageData | null = null;
  private frozenRefinementCount = 0;
  private frozenConverged = false;
  private readonly MAX_FROZEN_REFINEMENT_PASSES = 6;

  triggerHaptic(durationMs = 12): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(durationMs);
      } catch {
        // Safe fallback if vibration is blocked
      }
    }
  }

  setSheetSnap(snap: 'collapsed' | 'peek' | 'half' | 'full'): void {
    this.sheetSnap.set(snap);
    this.triggerHaptic(8);
  }

  toggleSheetSnap(): void {
    const current = this.sheetSnap();
    if (current === 'collapsed' || current === 'peek') {
      this.setSheetSnap('half');
    } else if (current === 'half') {
      this.setSheetSnap('full');
    } else {
      this.setSheetSnap('peek');
    }
  }

  executeActionChip(action: 'copy' | 'translate' | 'search_web' | 'listen'): void {
    this.triggerHaptic(15);
    const detections = this.pipelineService.detections() || [];
    const textSnippet = detections
      .map((d) => d.canonicalText || d.rawText || '')
      .filter(Boolean)
      .join(' ')
      .trim();

    if (action === 'copy') {
      if (textSnippet && navigator.clipboard) {
        navigator.clipboard.writeText(textSnippet);
        this.showNotification('Text copied to clipboard');
      } else {
        this.showNotification('No text detected to copy');
      }
    } else if (action === 'translate') {
      const query = encodeURIComponent(textSnippet || '');
      window.open(`https://translate.google.com/?sl=auto&tl=en&text=${query}`, '_blank');
      this.showNotification('Opening Google Translate');
    } else if (action === 'search_web') {
      const query = encodeURIComponent(textSnippet || 'Lens search');
      window.open(`https://www.google.com/search?q=${query}`, '_blank');
    } else if (action === 'listen') {
      if (textSnippet && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textSnippet);
        window.speechSynthesis.speak(utterance);
        this.showNotification('Reading text aloud');
      } else {
        this.showNotification('Text-to-speech unavailable');
      }
    }
  }

  private showNotification(msg: string): void {
    this.actionNotification.set(msg);
    setTimeout(() => {
      if (this.actionNotification() === msg) {
        this.actionNotification.set(null);
      }
    }, 2500);
  }

  async togglePrimaryAction(): Promise<void> {
    const video = this.videoElement.nativeElement;
    this.triggerHaptic(18);

    if (!this.isFrozen()) {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.captureContext.drawImage(
          video,
          0,
          0,
          this.captureCanvas.width,
          this.captureCanvas.height,
        );
        this.frozenImageData = this.captureContext.getImageData(
          0,
          0,
          this.captureCanvas.width,
          this.captureCanvas.height,
        );
      }

      this.cameraService.pause(video);
      this.isFrozen.set(true);
      this.frozenRefinementCount = 0;
      this.frozenConverged = false;
      this.sheetSnap.set('half');

      this.saveHistoryCapture();
      this.processCompleteOffersBackend();
    } else {
      await this.cameraService.resume(video);
      this.isFrozen.set(false);
      this.frozenImageData = null;
      this.frozenRefinementCount = 0;
      this.frozenConverged = false;
      this.sheetSnap.set('peek');
    }
  }

  private processCompleteOffersBackend(): void {
    const offers = this.pipelineService.offers() || [];
    const coords = this.pipelineService.state().coordinates;
    const now = Date.now();

    for (const offer of offers) {
      if (isOfferComplete(offer) && offer.product && offer.price && coords) {
        const rawPriceNum = Number.parseFloat(offer.price.replace(/[^0-9.]/g, ''));
        if (!Number.isNaN(rawPriceNum)) {
          // Always query real-time price comparison rating from Backend
          this.priceApiService.comparePrice(offer.product, rawPriceNum, coords).subscribe((res) => {
            if (res) {
              offer.priceRating = res.rating;
            }
          });

          // Generate unique product offer fingerprint (product + unit + price + rounded lat/lng)
          if (this.authService.isAuthenticated()) {
            const latKey = coords.latitude.toFixed(3);
            const lngKey = coords.longitude.toFixed(3);
            const qtyKey = offer.quantity
              ? `${offer.quantity.quantity}_${offer.quantity.unit}`
              : 'none';
            const fingerprint = `${offer.product.toUpperCase().trim()}_${qtyKey}_${rawPriceNum}_${latKey}_${lngKey}`;

            const lastSubmitted = this.submittedFingerprints.get(fingerprint);
            if (!lastSubmitted || now - lastSubmitted >= this.SUBMISSION_COOLDOWN_MS) {
              this.submittedFingerprints.set(fingerprint, now);
              this.priceApiService.submitPrice(offer, coords).subscribe();
            }
          }
        }
      }
    }
  }

  private saveHistoryCapture(): void {
    try {
      const dataUrl = this.captureCanvas.toDataURL('image/jpeg', 0.85);
      const detections = this.pipelineService.detections() || [];
      const textSnippet = detections
        .map((d) => d.canonicalText || d.rawText || '')
        .filter(Boolean)
        .join(' ')
        .trim();
      const coordinates = this.pipelineService.state().coordinates;

      this.historyService.addCapture(dataUrl, detections.length, textSnippet, coordinates);
    } catch (e) {
      console.warn('Could not capture frame to history:', e);
    }
  }

  openModal(modal: ModalType): void {
    this.activeModal.set(modal);
  }

  closeModal(): void {
    this.activeModal.set('none');
    this.selectedHistoryItem.set(null);
    this.feedbackSubmitted.set(false);
  }

  toggleMenu(): void {
    if (this.activeModal() === 'menu') {
      this.closeModal();
    } else {
      this.openModal('menu');
    }
  }

  switchToDesktopView(): void {
    this.closeModal();
    this.deviceService.setForcedMode('auto');
  }

  signInGoogle(): void {
    this.authService.signInWithGoogle();
  }

  signOut(): void {
    this.authService.signOut();
  }

  submitFeedback(): void {
    if (!this.feedbackText().trim()) return;
    this.feedbackSubmitted.set(true);
    setTimeout(() => {
      this.feedbackText.set('');
      this.closeModal();
    }, 1500);
  }

  viewHistoryItem(item: HistoryItem): void {
    this.selectedHistoryItem.set(item);
  }

  deleteHistoryItem(id: string, event?: Event): void {
    event?.stopPropagation();
    this.historyService.deleteItem(id);
    if (this.selectedHistoryItem()?.id === id) {
      this.selectedHistoryItem.set(null);
    }
  }

  clearHistory(): void {
    this.historyService.clearHistory();
    this.selectedHistoryItem.set(null);
  }

  triggerDebug(): void {
    this.closeModal();
    this.openDebug.emit();
  }

  private runDetectionLoop = async () => {
    if (this.isDestroyed) {
      return;
    }

    if (!this.detectionInProgress) {
      if (!this.isFrozen()) {
        this.detectionInProgress = true;
        try {
          if (this.videoElement?.nativeElement?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            this.captureContext.drawImage(
              this.videoElement.nativeElement,
              0,
              0,
              this.captureCanvas.width,
              this.captureCanvas.height,
            );

            const image = this.captureContext.getImageData(
              0,
              0,
              this.captureCanvas.width,
              this.captureCanvas.height,
            );
            await this.pipelineService.execute(image);
            this.processCompleteOffersBackend();
          }
        } catch (err) {
          console.warn('Error in detection loop execution:', err);
        } finally {
          this.detectionInProgress = false;
        }
      } else if (!this.frozenConverged && this.frozenImageData) {
        this.detectionInProgress = true;
        try {
          await this.pipelineService.execute(this.frozenImageData);
          this.frozenRefinementCount++;
          this.processCompleteOffersBackend();

          const detections = this.pipelineService.detections() || [];
          const allSatisfied =
            detections.length > 0 &&
            detections.every(
              (d) => d.isReused || (d.rawTextScore !== undefined && d.rawTextScore >= 0.85),
            );

          if (allSatisfied || this.frozenRefinementCount >= this.MAX_FROZEN_REFINEMENT_PASSES) {
            this.frozenConverged = true;
          }
        } catch (err) {
          console.warn('Error in frozen frame refinement loop:', err);
          this.frozenConverged = true;
        } finally {
          this.detectionInProgress = false;
        }
      }
    }

    if (!this.isDestroyed) {
      this.animationFrameId = requestAnimationFrame(this.runDetectionLoop);
    }
  };

  private resizeCanvases(HTMLVideoElement: HTMLVideoElement): void {
    this.captureCanvas.width = HTMLVideoElement.videoWidth || 640;
    this.captureCanvas.height = HTMLVideoElement.videoHeight || 480;
  }
}
