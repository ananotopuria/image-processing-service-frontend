import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getSharedAccess, sharingError } from "../api/sharing";
import type { Share, SharedAccess } from "../api/sharing.types";
import { isPresignedUrlExpired } from "../utils/imageHistory";

export function useSharedImageAccess(shareId: string, available: boolean, revision: number) {
  const key = `${shareId}:${available}:${revision}`;
  const [result, setResult] = useState<{ key: string; data: SharedAccess | null; share: Share | null; error: string; unavailable: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [, tick] = useState(0);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!available || request.current) return null;
    const controller = new AbortController(); request.current = controller; setLoading(true);
    try {
      const data = await getSharedAccess(shareId, controller.signal);
      if (controller.signal.aborted) return null;
      setResult({ key, data, share: data.share, error: "", unavailable: false }); return data;
    } catch (error) {
      if (!controller.signal.aborted) setResult((previous) => ({ key, data: null,
        // Retain share metadata when access fails, but clear all signed URLs.
        share: previous?.share?._id === shareId ? previous.share : null,
        error: sharingError(error), unavailable: axios.isAxiosError(error) && error.response?.status === 404 }));
      return null;
    } finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setLoading(false); }
  }, [shareId, available, key]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; request.current?.abort(); request.current = null; };
  }, [load]);
  const current = result?.key === key ? result : null;
  const image = available ? current?.data?.image ?? null : null;
  useEffect(() => {
    if (!image) return;
    const delay = Date.parse(image.urlExpiresAt) - Date.now() - 30000;
    if (delay <= 0) return;
    const timer = window.setTimeout(() => tick((value) => value + 1), Math.min(delay, 2147483647));
    return () => window.clearTimeout(timer);
  }, [image]);
  async function download() {
    // Recheck access even when a cached URL has not expired: revocation is
    // authoritative at this recipient-only endpoint. Never use /api/images here.
    const data = await load();
    if (!data || isPresignedUrlExpired(data.image.urlExpiresAt, Date.now(), 0)) return;
    const link = document.createElement("a"); link.href = data.image.downloadUrl;
    link.download = data.image.filename; link.rel = "noreferrer";
    document.body.append(link); link.click(); link.remove();
  }
  return { image, share: result?.share?._id === shareId ? result.share : null,
    loading: available && (loading || !current), unavailable: !available || Boolean(current?.unavailable),
    error: current?.error ?? "", expired: image ? isPresignedUrlExpired(image.urlExpiresAt) : false, refresh: load, download };
}
