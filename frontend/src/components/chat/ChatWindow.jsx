import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Check, CheckCheck, Clock, MessageCircle, Send } from "lucide-react";
import Avatar from "./Avatar";
import { dayLabel, formatTime } from "./chatUtils";

export default function ChatWindow({
  conversation, messages, loading, hasMore, loadingOlder, onLoadOlder,
  myId, canSend, otherLastReadAt, onSend, onBack,
}) {
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const topRef = useRef(null);
  const atBottomRef = useRef(true);
  const prevRef = useRef({ convId: null, firstId: null, lastId: null, height: 0 });
  const [showJump, setShowJump] = useState(false);

  // Re-check every 30s so messages vanish from the screen when they expire,
  // without needing a refresh.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const visible = (messages || []).filter((m) => new Date(m.expires_at).getTime() > now);

  // New chat opened: clear the draft, and focus the box on desktop only
  // (on phones that would pop the keyboard open).
  useEffect(() => {
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      if (window.matchMedia("(min-width: 861px)").matches) inputRef.current.focus();
    }
  }, [conversation?.id]);

  const firstId = visible[0]?.id ?? null;
  const lastId = visible[visible.length - 1]?.id ?? null;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prev = prevRef.current;

    if (prev.convId !== conversation?.id) {
      // opened another chat: start at the newest message
      atBottomRef.current = true;
      setShowJump(false);
      el.scrollTop = el.scrollHeight;
    } else if (prev.firstId !== null && firstId !== null && firstId < prev.firstId) {
      // older messages were added on top: keep what the user is reading in place
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (lastId !== prev.lastId) {
      // something new at the bottom
      const newest = visible[visible.length - 1];
      if (atBottomRef.current || newest?.sender_id === myId) {
        el.scrollTo({ top: el.scrollHeight, behavior: prev.lastId === null ? "auto" : "smooth" });
      } else {
        setShowJump(true); // the user is reading history: don't yank them down
      }
    }

    prevRef.current = { convId: conversation?.id, firstId, lastId, height: el.scrollHeight };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, firstId, lastId]);

  // Load the next older page when the top of the list scrolls into view
  useEffect(() => {
    const root = containerRef.current;
    const target = topRef.current;
    if (!root || !target || !hasMore || loadingOlder) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadOlder();
      },
      { root, rootMargin: "200px 0px 0px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingOlder, conversation?.id]);

  const handleScroll = (e) => {
    const el = e.currentTarget;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottomRef.current) setShowJump(false);
  };

  if (!conversation) {
    return (
      <div className="chat-window chat-placeholder">
        <MessageCircle size={52} />
        <h2>Pick a conversation</h2>
        <p>Choose a chat on the left, or find someone in the People tab.</p>
      </div>
    );
  }

  const autoGrow = (el) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    if (onSend(content)) {
      setText("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter inserts a new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <button type="button" className="chat-back-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <Avatar name={conversation.other_user.username} size={40} />
        <div>
          <div className="chat-window-name">{conversation.other_user.username}</div>
          <div className="chat-window-sub">Messages disappear after 24 hours</div>
        </div>
      </div>

      <div className="chat-messages-wrap">
        <div className="chat-messages" ref={containerRef} onScroll={handleScroll}>
          <div ref={topRef} className="chat-top-sentinel" />
          {loadingOlder && <div className="chat-older-loading">Loading older messages...</div>}

          {!hasMore && (
            <div className="chat-note">
              <Clock size={13} />
              Messages in this chat are deleted 24 hours after they are sent.
            </div>
          )}

          {loading && visible.length === 0 && <div className="chat-note">Loading messages...</div>}


          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const mine = m.sender_id === myId;
            const newDay = !prev || dayLabel(prev.sent_at) !== dayLabel(m.sent_at);
            const groupStart = !prev || newDay || prev.sender_id !== m.sender_id;

            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="chat-day">
                    <span>{dayLabel(m.sent_at)}</span>
                  </div>
                )}
                <div
                  className={`chat-row ${mine ? "chat-row-mine" : ""} ${
                    groupStart ? "chat-row-start" : ""
                  }`}
                >
                  <div
                    className={`chat-bubble ${
                      mine ? "chat-bubble-mine" : "chat-bubble-theirs"
                    }`}
                    title={`Disappears ${new Date(m.expires_at).toLocaleString()}`}
                  >
                    <span className="chat-bubble-text">{m.content}</span>
                    <span className="chat-meta">
                      <span className="chat-time">{formatTime(m.sent_at)}</span>
                      {mine && (
                        otherLastReadAt && new Date(otherLastReadAt) >= new Date(m.sent_at) ? (
                          <CheckCheck size={13} className="chat-receipt chat-receipt-read" title="Read" />
                        ) : (
                          <Check size={13} className="chat-receipt" title="Sent" />
                        )
                      )}
                    </span>
                  </div>
                </div>
              </Fragment>
            );
          })}
          </div>
          {showJump && (
            <button
              type="button"
              className="chat-jump"
              onClick={() => {
                containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
                setShowJump(false);
              }}
            >
              <ArrowDown size={14} />
              New messages
            </button>
          )}
        </div>

      <div className="chat-composer">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          maxLength={4000}
          placeholder={canSend ? "Type a message" : "Reconnecting..."}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="chat-send-btn"
          onClick={submit}
          disabled={!canSend || !text.trim()}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}