// frontend/src/hooks/useMessages.js
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export function useMessages(conversationId) {
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);

  useEffect(() => {
    if (!conversationId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);
    setLoadingInitial(true);

    api
      .get(`/conversations/${conversationId}/messages`, {
        params: { limit: 30 },
        signal: controller.signal,
      })
      .then(({ data }) => {
        setMessages(data.items);
        setNextCursor(data.next_cursor);
        setHasMore(data.has_more);
      })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setError(err.response?.data?.detail || "Failed to load messages");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingInitial(false);
      });

    return () => controller.abort();
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasMore || !nextCursor || loadingOlder) return false;

    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`, {
        params: { limit: 30, cursor: nextCursor },
      });

      // Deduplicate by id in case a live message overlapped
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = data.items.filter((m) => !seen.has(m.id));
        return [...older, ...prev];
      });
      setNextCursor(data.next_cursor);
      setHasMore(data.has_more);
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load older messages");
      return false;
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, nextCursor, loadingOlder]);

  const appendMessage = useCallback((msg) => {
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
    );
  }, []);

  return {
    messages,
    hasMore,
    loadingInitial,
    loadingOlder,
    error,
    loadOlder,
    appendMessage,
  };
}