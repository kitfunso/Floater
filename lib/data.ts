import invoicesJson from '@/data/invoices.json';
import vendorsJson from '@/data/vendors.json';
import forecastJson from '@/data/cash-forecast.json';
import type { Invoice, Vendor, Forecast } from './types';

export function loadInvoices(): Invoice[] { return invoicesJson as Invoice[]; }
export function loadVendors():  Vendor[]  { return vendorsJson  as Vendor[]; }
export function loadForecast(): Forecast  { return forecastJson as Forecast; }

export function loadAll(): { invoices: Invoice[]; vendors: Vendor[]; forecast: Forecast } {
  return {
    invoices: loadInvoices(),
    vendors:  loadVendors(),
    forecast: loadForecast(),
  };
}
