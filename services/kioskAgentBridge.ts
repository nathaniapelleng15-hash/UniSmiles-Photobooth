export interface KioskAgentState {
  maintenanceMode: boolean;
  brightness: number;
  volume: number;
  resolution: string;
  paperSize: string;
  updatedAt?: string;
}

type StateCallback = (state: KioskAgentState) => void;

class KioskAgentBridge {
  private socket: WebSocket | null = null;
  private listeners: Set<StateCallback> = new Set();
  private reconnectTimer: any = null;
  private currentPort = 3001;

  public currentState: KioskAgentState = {
    maintenanceMode: false,
    brightness: 80,
    volume: 100,
    resolution: '1080x1920',
    paperSize: '4x6',
  };

  constructor() {
    this.connect();
    this.pollFallback();
  }

  public subscribe(callback: StateCallback): () => void {
    this.listeners.add(callback);
    callback(this.currentState); // Immediate state emit
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.currentState));
  }

  private connect() {
    try {
      this.socket = new WebSocket(`ws://localhost:${this.currentPort}`);

      this.socket.onopen = () => {
        console.log('[KioskAgentBridge] Connected to Local Kiosk Agent service.');
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INITIAL_STATE' || data.type === 'STATE_UPDATE') {
            this.currentState = { ...this.currentState, ...data.payload };
            this.notify();
          }
        } catch (e) {
          // ignore non-json messages
        }
      };

      this.socket.onclose = () => {
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        if (this.socket) {
          this.socket.close();
        }
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  private pollFallback() {
    setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${this.currentPort}/api/kiosk-status`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            const mode = Boolean(json.data.maintenanceMode);
            if (mode !== this.currentState.maintenanceMode) {
              this.currentState = { ...this.currentState, ...json.data };
              this.notify();
            }
          }
        }
      } catch (e) {
        // Agent offline or loading
      }
    }, 10000);
  }
}

export const kioskAgentBridge = new KioskAgentBridge();
