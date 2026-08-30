import api from "@/lib/api"
import type { Category, CategoryOutstanding, Family, FamilyDetail, FestivalCharge, FestivalChargeApplyResult, FestivalChargePreview, LedgerEntry, OutstandingFamily, OutstandingSummary, Payment, Settings } from "./family-contributions-types"

const BASE = "/family-contributions"

export const fcApi = {
  getCategories: () => api.get<Category[]>(`${BASE}/categories`).then((r) => r.data),
  createCategory: (data: Partial<Category>) => api.post<Category>(`${BASE}/categories`, data).then((r) => r.data),

  getSettings: () => api.get<Settings>(`${BASE}/settings`).then((r) => r.data),
  updateSettings: (data: Partial<Settings>) => api.put<Settings>(`${BASE}/settings`, data).then((r) => r.data),

  getFamilies: (params?: Record<string, string | number | boolean>) =>
    api.get<{ items: Family[]; total: number; page: number; page_size: number }>(`${BASE}/families`, { params }).then((r) => r.data),
  getNextFamilyNumber: () =>
    api.get<{ family_number: string; head_of_family: string }>(`${BASE}/families/next-number`).then((r) => r.data),
  getFamily: (id: string) => api.get<Family>(`${BASE}/families/${id}`).then((r) => r.data),
  createFamily: (data: Partial<Family>) => api.post<Family>(`${BASE}/families`, data).then((r) => r.data),
  updateFamily: (id: string, data: Partial<Family>) => api.put<Family>(`${BASE}/families/${id}`, data).then((r) => r.data),
  deleteFamily: (id: string) => api.delete(`${BASE}/families/${id}`),
  restoreFamily: (id: string) => api.post<Family>(`${BASE}/families/${id}/restore`).then((r) => r.data),

  getPayments: (params?: Record<string, string | number>) =>
    api.get<{ items: Payment[]; total: number }>(`${BASE}/payments`, { params }).then((r) => r.data),
  getPayment: (id: string) => api.get<Payment>(`${BASE}/payments/${id}`).then((r) => r.data),
  createPayment: (data: Record<string, unknown>) => api.post<Payment>(`${BASE}/payments`, data).then((r) => r.data),
  deletePayment: (id: string) => api.delete(`${BASE}/payments/${id}`),

  getOutstanding: (params?: Record<string, string | number>) =>
    api.get<{ items: OutstandingFamily[]; total: number; summary: OutstandingSummary }>(`${BASE}/outstanding`, { params }).then((r) => r.data),
  getFamilyDetail: (id: string) => api.get<FamilyDetail>(`${BASE}/outstanding/${id}`).then((r) => r.data),
  getCategoryOutstanding: (familyId: string, categoryId: string) =>
    api.get<CategoryOutstanding>(`${BASE}/families/${familyId}/outstanding/${categoryId}`).then((r) => r.data),

  getFamilyLedger: (familyId: string, params?: Record<string, string>) =>
    api.get<LedgerEntry[]>(`${BASE}/ledger/family/${familyId}`, { params }).then((r) => r.data),
  getCategoryLedger: (categoryId: string) => api.get<LedgerEntry[]>(`${BASE}/ledger/category/${categoryId}`).then((r) => r.data),
  getMasterLedger: (params?: Record<string, string | number>) =>
    api.get<LedgerEntry[]>(`${BASE}/ledger/master`, { params }).then((r) => r.data),

  getPaymentStatusReport: (params: { category_id: string; month: number; year: number }) =>
    api.get(`${BASE}/reports/payment-status`, { params }).then((r) => r.data),
  getMonthlyCollection: (month: number, year: number) =>
    api.get(`${BASE}/reports/monthly-collection`, { params: { month, year } }).then((r) => r.data),
  getCategoryCollection: (params?: { start_date?: string; end_date?: string }) =>
    api.get(`${BASE}/reports/category-collection`, { params }).then((r) => r.data),
  getWardCollection: (params?: { month?: number; year?: number }) =>
    api.get(`${BASE}/reports/ward-collection`, { params }).then((r) => r.data),
  getTopDefaulters: (limit = 20) =>
    api.get<{ items: OutstandingFamily[]; total: number; summary: OutstandingSummary }>(`${BASE}/reports/top-defaulters`, { params: { limit } }).then((r) => r.data),
  getPaymentRegister: (params?: { start_date?: string; end_date?: string }) =>
    api.get<{ items: Payment[]; total: number }>(`${BASE}/reports/payment-register`, { params }).then((r) => r.data),

  getFestivalCharges: (params?: Record<string, string | number>) =>
    api.get<{ items: FestivalCharge[]; total: number }>(`${BASE}/festival-charges`, { params }).then((r) => r.data),
  getFestivalCharge: (id: string) => api.get<FestivalCharge>(`${BASE}/festival-charges/${id}`).then((r) => r.data),
  createFestivalCharge: (data: Record<string, unknown>) => api.post<FestivalCharge>(`${BASE}/festival-charges`, data).then((r) => r.data),
  previewFestivalCharge: (id: string) => api.get<FestivalChargePreview>(`${BASE}/festival-charges/${id}/preview`).then((r) => r.data),
  applyFestivalCharge: (id: string) => api.post<FestivalChargeApplyResult>(`${BASE}/festival-charges/${id}/apply`).then((r) => r.data),
}
