"use client";

import { getMockResponse } from "./mock-data";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
const OFFLINE_DEMO = process.env.NEXT_PUBLIC_OFFLINE_DEMO === "true";
const OFFLINE_DEMO_EMAIL =
  process.env.NEXT_PUBLIC_OFFLINE_DEMO_EMAIL ?? "admin@example.com";
const OFFLINE_DEMO_PASSWORD =
  process.env.NEXT_PUBLIC_OFFLINE_DEMO_PASSWORD ?? "CHANGE_ME_DEFAULT_ADMIN_PASSWORD";

export type ResourceState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function getToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("law-token") ?? "";
}

export function isOfflineDemo() {
  return OFFLINE_DEMO;
}

export function getOfflineDemoCredentials() {
  return {
    email: OFFLINE_DEMO_EMAIL,
    password: OFFLINE_DEMO_PASSWORD
  };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const mockResponse = getMockResponse<T>(path, init);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (OFFLINE_DEMO && path === "/auth/login") {
    const credentials = init?.body ? JSON.parse(String(init.body)) as { email?: string; password?: string } : {};

    if (credentials.email === OFFLINE_DEMO_EMAIL && credentials.password === OFFLINE_DEMO_PASSWORD) {
      return mockResponse as T;
    }

    throw new Error(
      `Credenciais invalidas. Use ${OFFLINE_DEMO_EMAIL} / ${OFFLINE_DEMO_PASSWORD}.`
    );
  }

  if (OFFLINE_DEMO && mockResponse) {
    return mockResponse;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });
    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
        window.localStorage.removeItem("law-token");
        window.localStorage.removeItem("law-refresh-token");
        window.location.href = "/login";
      }
      const detail = await response.text();
      throw new Error(detail || "Falha na requisicao");
    }

    return response.json();
  } catch (error) {
    if (OFFLINE_DEMO && mockResponse) {
      return mockResponse;
    }
    throw error;
  }
}
