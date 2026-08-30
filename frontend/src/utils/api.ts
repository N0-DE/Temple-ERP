import { fcApi } from "../lib/family-contributions-api";

/**
 * Wrapper around family contributions API for the Debtors Report page.
 * Provides easy‑to‑use functions that return the underlying data.
 */
export const fetchOutstandingFamilies = async (params: {
  search?: string;
  ward?: string;
  min_amount?: number;
  min_months?: number;
  sort_by?: string;
}) => {
  const response = await fcApi.getOutstanding(params);
  return response.items;
};

export const fetchFamilyDetail = async (familyId: string) => {
  return await fcApi.getFamilyDetail(familyId);
};
