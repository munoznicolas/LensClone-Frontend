import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, firstValueFrom } from 'rxjs';
import { SettingsService } from '../settings/settings.service';
import { GpsCoordinates, ProductOffer } from '../text-detection/types';
import { IndexedDbService } from '../storage/indexed-db.service';
import { AuthService } from '../auth/auth.service';

export enum PriceRating {
  NewSubmission = 0,
  BelowAverage = 1,
  Average = 2,
  AboveAverage = 3,
}

export interface PriceComparisonResponse {
  productName: string;
  currentPrice: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  sampleCount: number;
  rating: PriceRating;
  radiusKm: number;
  timeWindowDays: number;
  tolerancePercent: number;
}

export interface PriceSubmissionResponse {
  success: boolean;
  message: string;
  submissionId: string;
}

export interface QueuedSubmission {
  id: string;
  url: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class PriceApiService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);
  private readonly idb = inject(IndexedDbService);
  private readonly auth = inject(AuthService);

  constructor() {
    this.registerOnlineListener();
  }

  /**
   * Price comparison lookup. Available to all users, including guest/unauthenticated sessions.
   */
  comparePrice(productName: string, price: number, coords?: GpsCoordinates): Observable<PriceComparisonResponse | null> {
    if (!productName || !price || !coords) {
      return of(null);
    }

    const url = `${this.settings.backendApiUrl()}/compare`;
    const payload = {
      productName,
      price,
      latitude: coords.latitude,
      longitude: coords.longitude,
      timeWindowDays: this.settings.timeWindowDays(),
      radiusKm: this.settings.radiusKm(),
      tolerancePercent: this.settings.tolerancePercent(),
    };

    return this.http.post<PriceComparisonResponse>(url, payload).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Submit observed product price. Restricted to authenticated users signed in with Google.
   * Guests/unauthenticated users cannot submit new data.
   */
  submitPrice(offer: ProductOffer, coords?: GpsCoordinates): Observable<PriceSubmissionResponse | null> {
    if (!this.auth.isAuthenticated()) {
      return of(null);
    }

    if (!offer.product || !offer.price || !coords) {
      return of(null);
    }

    const parsedPrice = Number.parseFloat(offer.price.replace(/[^0-9.]/g, ''));
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      return of(null);
    }

    const url = `${this.settings.backendApiUrl()}/submit`;
    const user = this.auth.currentUser();
    const payload = {
      productName: offer.product,
      quantityOrUnit: offer.quantity ? `${offer.quantity.quantity} ${offer.quantity.unit}` : undefined,
      price: parsedPrice,
      currency: 'ARS',
      latitude: coords.latitude,
      longitude: coords.longitude,
      deviceId: user ? `usr_${user.id}` : this.getOrCreateDeviceId(),
    };

    return this.http.post<PriceSubmissionResponse>(url, payload).pipe(
      catchError(async () => {
        await this.enqueueOfflineSubmission(url, payload);
        return {
          success: true,
          message: 'Saved offline. Submission queued for background sync.',
          submissionId: 'offline_queued',
        };
      })
    );
  }

  private async enqueueOfflineSubmission(url: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const item: QueuedSubmission = {
        id: `queued_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url,
        payload,
        queuedAt: new Date().toISOString(),
      };
      await this.idb.put('offline_queue', item);
    } catch (e) {
      console.warn('Failed to queue offline submission:', e);
    }
  }

  async flushOfflineQueue(): Promise<void> {
    try {
      const queued = await this.idb.getAll<QueuedSubmission>('offline_queue');
      if (!queued || queued.length === 0) return;

      for (const item of queued) {
        try {
          await firstValueFrom(this.http.post(item.url, item.payload));
          await this.idb.delete('offline_queue', item.id);
        } catch {
          // Keep item in queue if still failing
        }
      }
    } catch (e) {
      console.warn('Error flushing offline queue:', e);
    }
  }

  private registerOnlineListener(): void {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => {
        this.flushOfflineQueue();
      });
    }
  }

  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem('lensclone_device_id');
    if (!id) {
      id = `dev_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
      localStorage.setItem('lensclone_device_id', id);
    }
    return id;
  }
}
