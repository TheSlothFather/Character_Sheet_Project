export type CampaignEvent = {
  type: string;
  campaignId: string;
  sequence?: number;
  timestamp: string;
  payload?: unknown;
};

type SocketHandlers = {
  onEvent: (event: CampaignEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

const buildWebSocketUrl = (path: string) => {
  const base = new URL(window.location.href);
  base.pathname = path;
  base.search = "";
  base.hash = "";
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return base;
};

export const connectCampaignSocket = (campaignId: string, handlers: SocketHandlers, userId?: string): WebSocket => {
  const url = buildWebSocketUrl(`/api/campaigns/${encodeURIComponent(campaignId)}/connect`);
  if (userId) {
    url.searchParams.set("user", userId);
  }

  const socket = new WebSocket(url.toString());
  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", () => handlers.onError?.());
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      const parsed = JSON.parse(event.data) as CampaignEvent;
      if (!parsed || typeof parsed !== "object") return;
      handlers.onEvent(parsed);
    } catch {
      return;
    }
  });

  return socket;
};
