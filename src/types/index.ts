/**
 * OpenClaw 中间件类型定义
 */

// 环境变量类型
export interface Env {
  // OpenClaw 配置
  OPENCLAW_GATEWAY_URL: string
  OPENCLAW_AUTH_TOKEN: string
  OPENCLAW_DEVICE_ID: string
  OPENCLAW_CHANNELS: string
  OPENCLAW_THINKING: string
  OPENCLAW_RATE_LIMIT: string
  OPENCLAW_RATE_WINDOW: string
  
  // Cloudflare 服务
  DB: D1Database
  KV: KVNamespace
  OPENCLAW_QUEUE: Queue<ForumEvent>
}

// OpenClaw WebSocket 协议类型
export interface OpenClawConnectRequest {
  type: "req"
  id: string
  method: "connect"
  params: {
    deviceId: string
    deviceFamily: string
    challenge: string
    signature: string
    auth?: {
      token: string
    }
  }
}

export interface OpenClawAgentRequest {
  type: "req"
  id: string
  method: "agent"
  params: {
    message: string
    sessionId?: string
    thinking?: string
    idempotencyKey: string
  }
}

export interface OpenClawResponse {
  type: "res"
  id: string
  ok: boolean
  payload?: any
  error?: {
    code: string
    message: string
    details?: any
  }
}

export interface OpenClawEvent {
  type: "event"
  event: string
  payload: any
  seq?: number
  stateVersion?: number
}

// 论坛事件类型
export interface ForumEvent {
  type: 'post_created' | 'post_updated' | 'post_deleted' | 'comment_added' | 'comment_updated' | 'comment_deleted' | 'user_registered' | 'user_updated' | 'notification_sent'
  data: any
  timestamp: number
  id: string
}

// 消息类型
export interface OpenClawMessage {
  type: "req" | "event"
  id?: string
  method?: string
  event?: string
  params?: any
  payload?: any
}

// 配置类型
export interface OpenClawConfig {
  GATEWAY_URL: string
  AUTH_TOKEN: string
  DEVICE_ID: string
  ENABLED_CHANNELS: string[]
  DEFAULT_THINKING: string
  RATE_LIMIT: {
    maxMessages: number
    perSeconds: number
  }
}

// WebSocket 客户端状态
export interface WebSocketClientState {
  connected: boolean
  authenticated: boolean
  lastConnect: number
  lastError?: Error
  reconnectAttempts: number
  messageQueue: OpenClawMessage[]
}

// 工具定义类型
export interface OpenClawTool {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, any>
    required: string[]
  }
  handler: (params: any, env: Env) => Promise<any>
}

// 事件处理器类型
export interface EventHandler {
  handle(event: ForumEvent): Promise<void>
}

// 速率限制数据
export interface RateLimitData {
  count: number
  resetAt: number
}