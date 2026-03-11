/**
 * LINE 訊息事件發射器
 * 用於 webhook 和 SSE 之間的通訊
 */

type Listener = (channelId: string) => void

class LineEventEmitter {
  private listeners: Set<Listener> = new Set()

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(channelId: string) {
    this.listeners.forEach(listener => listener(channelId))
  }
}

// 單例模式
export const lineEvents = new LineEventEmitter()
