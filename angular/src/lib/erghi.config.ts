import { InjectionToken } from '@angular/core';

export interface ErghiConfig {
  apiUrl: string;
  signalrUrl?: string;
}

export const ERGHI_CONFIG = new InjectionToken<ErghiConfig>('ERGHI_CONFIG');
