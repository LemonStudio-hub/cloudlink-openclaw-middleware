/**
 * OpenClaw WebSocket 客户端
 */

import type { Env, OpenClawConfig, WebSocketClientState, OpenClawMessage, OpenClawResponse, OpenClawConnectRequest } from '../../../types'
import { generateId, generateChallenge, signChallenge, sleep, isValidWebSocketUrl } from '../../../utils'
import { loadConfig, validateConfig } from '../../config'

export class OpenClawClient {
  private ws: WebSocket | null = null
  private config: OpenClawConfig
  private state: WebSocketClientState
  private reconnectTimer: number | null = null
  private messageHandlers: Map<string, (response: OpenClawResponse) => void> = new Map()
  private eventHandlers: Map<string, (event: any) => void> = new Map()

  constructor(env: Env) {
    this.config = loadConfig(env)
    this.state = {
      connected: false,
      authenticated: false,
      lastConnect: 0,
      reconnectAttempts: 0,
      messageQueue: []
    }
  }

  async connect(): Promise<void> {
    if (!validateConfig(this.config)) {
      throw new Error('Invalid OpenClaw configuration')
    }

    if (!isValidWebSocketUrl(this.config.GATEWAY_URL)) {
      throw new Error('Invalid WebSocket URL')
    }

    try {
      this.ws = new WebSocket(this.config.GATEWAY_URL)
      
      this.ws.onopen = () => this.handleOpen()
      this.ws.onmessage = (event) => this.handleMessage(event)
      this.ws.onerror = (error) => this.handleError(error)
      this.ws.onclose = () => this.handleClose()
      
      // 等待连接建立
      await this.waitForConnection()
    } catch (error) {
      this.handleError(error as Error)
    }
  }

  private async handleOpen(): Promise<void> {
    console.log('OpenClaw WebSocket connected')
    this.state.connected = true
    this.state.lastConnect = Date.now()
    this.state.reconnectAttempts = 0
    
    // 发送连接请求
    await this.sendConnect()
    
    // 处理消息队列
    await this.processMessageQueue()
  }

  private async sendConnect(): Promise<void> {
    const connectMsg: OpenClawConnectRequest = {
      type: "req",
      id: generateId(),
      method: "connect",
      params: {
        deviceId: this.config.DEVICE_ID,
        deviceFamily: "cloudflare-worker",
        challenge: generateChallenge(),
        signature: await signChallenge(generateChallenge(), this.config.AUTH_TOKEN),
        auth: {
          token: this.config.AUTH_TOKEN
        }
      }
    }
    
    await this.send(connectMsg as OpenClawMessage)
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as OpenClawResponse | any
      
      if (message.type === 'res') {
        const handler = this.messageHandlers.get(message.id)
        if (handler) {
          handler(message)
          this.messageHandlers.delete(message.id)
        }
      } else if (message.type === 'event') {
        const handler = this.eventHandlers.get(message.event)
        if (handler) {
          handler(message.payload)
        }
      }
    } catch (error) {
      console.error('Failed to handle message:', error)
    }
  }

  private handleError(error: Event | Error): void {
    console.error('OpenClaw WebSocket error:', error)
    this.state.lastError = error instanceof Error ? error : new Error(String(error))
    this.state.connected = false
    this.state.authenticated = false
  }

  private async handleClose(): Promise<void> {
    console.log('OpenClaw WebSocket closed')
    this.state.connected = false
    this.state.authenticated = false
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    
    const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts), 30000)
    console.log(`Reconnecting in ${delay}ms...`)
    
    this.reconnectTimer = setTimeout(() => {
      this.state.reconnectAttempts++
      this.connect()
      this.reconnectTimer = null
    }, delay) as unknown as number
  }

  async send(message: OpenClawMessage): Promise<OpenClawResponse> {
    return new Promise((resolve, reject) => {
      const id = message.id || generateId()
      message.id = id
      
      this.messageHandlers.set(id, (response: OpenClawResponse) => {
        if (response.ok) {
          resolve(response)
        } else {
          reject(new Error(response.error?.message || 'Unknown error'))
        }
      })
      
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message))
      } else {
        this.state.messageQueue.push(message)
      }
    })
  }

  async sendAgentMessage(message: string, sessionId?: string, thinking?: string): Promise<any> {
    const response = await this.send({
      type: "req",
      id: generateId(),
      method: "agent",
      params: {
        message,
        sessionId,
        thinking: thinking || this.config.DEFAULT_THINKING,
        idempotencyKey: generateId()
      }
    })
    
    return response.payload
  }

  private async processMessageQueue(): Promise<void> {
    while (this.state.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.state.messageQueue.shift()!
      this.ws.send(JSON.stringify(message))
      await sleep(100)
    }
  }

  private async waitForConnection(timeout: number = 30000): Promise<void> {
    const startTime = Date.now()
    
    while (!this.state.connected && Date.now() - startTime < timeout) {
      await sleep(100)
    }
    
    if (!this.state.connected) {
      throw new Error('Connection timeout')
    }
  }

  on(event: string, handler: (payload: any) => void): void {
    this.eventHandlers.set(event, handler)
  }

  off(event: string): void {
    this.eventHandlers.delete(event)
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.state.connected = false
    this.state.authenticated = false
  }

  getState(): WebSocketClientState {
    return { ...this.state }
  }
}

// 健康检查端点
export async function healthCheck(): Promise<Response> {
  return Response.json({
    status: 'healthy',
    timestamp: Date.now(),
    service: 'cloudlink-openclaw-middleware'
  })
}