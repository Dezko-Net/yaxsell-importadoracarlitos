import { createContext, useContext } from 'react';

export interface VendorInfo {
  vendorId: string;
  name: string;
  email: string;
  minPurchaseAmount: number;
  storeWebsite?: string;
  logoUrl?: string;
  brandColor?: string;
}

export const VendorContext = createContext<VendorInfo | null>(null);

export function useVendor() {
  return useContext(VendorContext);
}
