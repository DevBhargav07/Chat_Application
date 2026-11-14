import api from "./axios";

export const getChatUsers = () => api.get("/chat/users");
export const getConversations = () => api.get("/chat/conversations");
export const openDirectConversation = (userId) =>
  api.post("/chat/conversations/direct", { user_id: userId });
export const getMessages = (conversationId, { before, limit = 30 } = {}) =>
  api.get(`/chat/conversations/${conversationId}/messages`, { params: { before, limit } });
export const markConversationRead = (conversationId) =>
  api.post(`/chat/conversations/${conversationId}/read`);