import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useChatSocket } from "../hooks/useChatSocket";
import {
  getChatUsers,
  getConversations,
  getMessages,
  markConversationRead,
  openDirectConversation,
} from "../api/chat";
import { getErrorMessage } from "../api/errors";
import ConversationList from "../components/chat/ConversationList";
import ChatWindow from "../components/chat/ChatWindow";

// userId was never saved by the login flow.
function getMyIdFromToken() {
  try {
    const token = localStorage.getItem("access_token");
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return Number(JSON.parse(atob(base64)).sub);
  } catch {
    return NaN;
  }
}

// Combines two lists of messages without duplications, oldest first.
function mergeMessages(a, b){
  const byId = new Map();
  [...a, ...b].forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort((x, y) => x.id - y.id);
}

export default function Chat() {
  const { userId } = useAuth();
  const myId = Number(userId) || getMyIdFromToken();

  const [conversations, setConversations] = useState([]);
  const [people, setPeople] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [loadingList, setLoadingList] = useState(true);

  // Refs give the socket handler the *current* values without making it
  // re-create (and re-subscribe) on every render.
  const conversationsRef = useRef([]);
  const activeIdRef = useRef(null);
  const messagesRef = useRef({});
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    messagesRef.current = messagesByConv;
  }, [messagesByConv]);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await getConversations();
      setConversations(res.data);
    } catch {
      /* keep what we have */
    }
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    try {
      const res = await getMessages(conversationId);
      const { items, has_more, next_cursor } = res.data;

      setMessagesByConv((prev) => {
        const existing = prev[conversationId];
        if (!existing) {
          return {
            ...prev,
            [conversationId]: { items, hasMore: has_more, cursor: next_cursor, loadingOlder: false },
          };
        }
        // Re-sync (reconnect, reopening a chat): keep older pages the user already loaded.
        const loadedFurtherBack =
          existing.items.length > 0 && existing.items[0].id < (items[0]?.id ?? Infinity);
        return {
          ...prev,
          [conversationId]: {
            items: mergeMessages(existing.items, items),
            hasMore: loadedFurtherBack ? existing.hasMore : has_more,
            cursor: loadedFurtherBack ? existing.cursor : next_cursor,
            loadingOlder: false,
          },
        };
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load messages"));
      setMessagesByConv((prev) =>
        prev[conversationId]
          ? prev
          : { ...prev, [conversationId]: { items: [], hasMore: false, cursor: null, loadingOlder: false } }
      );
    }
  }, []);
  const loadOlder = useCallback(async (conversationId) => {
  const thread = messagesRef.current[conversationId];
  if (!thread || !thread.hasMore || thread.loadingOlder) return;

  setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: { ...prev[conversationId], loadingOlder: true },
    }));

    try {
      const res = await getMessages(conversationId, { before: thread.cursor });
      const { items, has_more, next_cursor } = res.data;
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: {
          items: mergeMessages(items, prev[conversationId].items),
          hasMore: has_more,
          cursor: next_cursor,
          loadingOlder: false,
        },
      }));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load older messages"));
      setMessagesByConv((prev) => ({
        ...prev,
        [conversationId]: { ...prev[conversationId], loadingOlder: false },
      }));
    }
  }, []);

  // Initial load (with the ignore guard, so StrictMode can't cause stale overwrites)
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const [convRes, peopleRes] = await Promise.all([getConversations(), getChatUsers()]);
        if (!ignore) {
          setConversations(convRes.data);
          setPeople(peopleRes.data);
        }
      } catch (error) {
        if (!ignore) toast.error(getErrorMessage(error, "Failed to load chats"));
      } finally {
        if (!ignore) setLoadingList(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  // On phones an open conversation goes full-screen (CSS hides the top bar).
  useEffect(() => {
    document.body.classList.toggle("chat-immersive", Boolean(activeId));
    return () => document.body.classList.remove("chat-immersive");
  }, [activeId]);

  // Everything the server pushes to us arrives here.
  const handleSocketMessage = useCallback(
    (event) => {
      if (event.type === "error") {
        toast.error(event.detail || "Message failed");
        return;
      }
      if (event.type !== "message") return;

      const msg = event.message;
      const convId = msg.conversation_id;

      // Add to the open message list (skip duplicates)
      setMessagesByConv((prev) => {
        const thread = prev[convId];
        if (!thread && activeIdRef.current !== convId) return prev;
        const base = thread || { items: [], hasMore: false, cursor: null, loadingOlder: false };
        if (base.items.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [convId]: { ...base, items: [...base.items, msg] } };
      });

      // Someone started a brand-new chat with us: fetch it.
      if (!conversationsRef.current.some((c) => c.id === convId)) {
        refreshConversations();
        return;
      }

      const isActive = activeIdRef.current === convId;
      const fromMe = msg.sender_id === myId;

      // Move this conversation to the top with the new preview.
      setConversations((prev) => {
        const target = prev.find((c) => c.id === convId);
        if (!target) return prev;
        const updated = {
          ...target,
          last_message: msg,
          unread_count: isActive || fromMe ? 0 : target.unread_count + 1,
        };
        return [updated, ...prev.filter((c) => c.id !== convId)];
      });

      if (isActive && !fromMe) markConversationRead(convId).catch(() => {});
    },
    [myId, refreshConversations]
  );

  const { status, send } = useChatSocket(handleSocketMessage);

  // If the connection dropped and came back, we may have missed messages: re-sync.
  const hadConnection = useRef(false);
  useEffect(() => {
    if (status !== "open") return;
    if (hadConnection.current) {
      refreshConversations();
      if (activeIdRef.current) loadMessages(activeIdRef.current);
    }
    hadConnection.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const selectConversation = useCallback(
    (id) => {
      setActiveId(id);

      const conv = conversationsRef.current.find((c) => c.id === id);
      if (conv && conv.unread_count > 0) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
        );
        markConversationRead(id).catch(() => {});
      }

      loadMessages(id);
    },
    [loadMessages]
  );

  const startChat = useCallback(
    async (person) => {
      const existing = conversationsRef.current.find((c) => c.other_user.id === person.id);
      if (existing) {
        selectConversation(existing.id);
        return;
      }
      try {
        const res = await openDirectConversation(person.id);
        setConversations((prev) =>
          prev.some((c) => c.id === res.data.id) ? prev : [res.data, ...prev]
        );
        selectConversation(res.data.id);
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not start chat"));
      }
    },
    [selectConversation]
  );

  const handleSend = (content) => {
    const ok = send({ type: "message", conversation_id: activeId, content });
    if (!ok) toast.error("Not connected. Reconnecting...");
    return ok;
  };

  const activeConversation = conversations.find((c) => c.id === activeId) || null;
  const activeThread = activeId ? messagesByConv[activeId] : null;

  return (
    <div className={`chat-shell ${activeId ? "chat-shell-open" : ""}`}>
      <ConversationList
        conversations={conversations}
        people={people}
        activeId={activeId}
        status={status}
        loading={loadingList}
        onSelect={selectConversation}
        onStartChat={startChat}
      />
      <ChatWindow
        conversation={activeConversation}
        messages={activeThread ? activeThread.items : []}
        loading={activeId ? !activeThread : false}
        hasMore={activeThread?.hasMore ?? false}
        loadingOlder={activeThread?.loadingOlder ?? false}
        onLoadOlder={() => loadOlder(activeId)}
        myId={myId}
        canSend={status === "open"}
        otherLastReadAt={activeConversation?.other_last_read_at}
        onSend={handleSend}
        onBack={() => setActiveId(null)}
      />
    </div>
  );
}