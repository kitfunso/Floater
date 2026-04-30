// Read mock data files. Centralised so route handlers + page server component
// share one read implementation.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Invoice, Vendor, Forecast } from './types';

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', name), 'utf8')) as T;
}

export function loadInvoices(): Invoice[] { return readJson<Invoice[]>('invoices.json'); }
export function loadVendors():  Vendor[]  { return readJson<Vendor[]>('vendors.json'); }
export function loadForecast(): Forecast  { return readJson<Forecast>('cash-forecast.json'); }

export function loadAll(): { invoices: Invoice[]; vendors: Vendor[]; forecast: Forecast } {
  return { invoices: loadInvoices(), vendors: loadVendors(), forecast: loadForecast() };
}
