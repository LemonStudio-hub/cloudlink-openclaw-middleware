/**
 * OpenClaw WebSocket 客户端（增强版）
 * 支持连接池、心跳检测和状态管理
 */

import type { Env, OpenClawConfig, WebSocketClientState, OpenClawMessage, OpenClawResponse, OpenClawConnectRequest } from '../../../types'
import { generateId, generateChallenge, signChallenge, sleep, isValidWebSocketUrl } from '../../../utils'
import { loadConfig, validateConfig } from '../../config'

// 连接池配置
interface ConnectionPoolConfig {
  maxSize: number
  minSize: number
  idleTimeout: number
  maxLifetime: number
}

// 连接实例
interface ConnectionInstance {
  ws: WebSocket
  id: string
  createdAt: number
  lastUsed: number
  isActive: boolean
}

// 心跳配置
interface HeartbeatConfig {
  interval: number
  timeout: number
  maxMissed: number
}

// 扩展的状态
interface ExtendedClientState extends WebSocketClientState {
  poolSize: number
  activeConnections: number
  lastHeartbeat: number
  missedHeartbeats: number
  messagesSent: number
  messagesReceived: number
  bytesSent: number
  bytesReceived: number
}

export class OpenClawClient {
  private config: OpenClawConfig
  private state: ExtendedClientState
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private messageHandlers: Map<string, (response: OpenClawResponse) => void> = new Map()
  private eventHandlers: Map<string, (event: any) => void> = new Map()
  
  // 连接池
  private connectionPool: Map<string, ConnectionInstance> = new Map()
  private poolConfig: ConnectionPoolConfig
  
  // 心跳
  private heartbeatConfig: HeartbeatConfig
  
  // 主连接
  private mainConnection: WebSocket | null = null
  
  // 消息队列（带优先级）
  private messageQueue: Array<{ message: OpenClawMessage; priority: number; resolve: (value: any) => void; reject: (reason: any) => void }> = []

  constructor(env: Env) {
    this.config = loadConfig(env)
    this.state = {
      connected: false,
      authenticated: false,
      lastConnect: 0,
      reconnectAttempts: 0,
      messageQueue: [],
      poolSize: 0,
      activeConnections: 0,
      lastHeartbeat: 0,
      missedHeartbeats: 0,
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0
    }
    
    // 连接池配置
    this.poolConfig = {
      maxSize: 5,
      minSize: 1,
      idleTimeout: 300000, // 5 minutes
      maxLifetime: 3600000 // 1 hour
    }
    
    // 心跳配置
    this.heartbeatConfig = {
      interval: 30000, // 30 seconds
      timeout: 10000, // 10 seconds
      maxMissed: 3
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
      // 创建主连接
      this.mainConnection = new WebSocket(this.config.GATEWAY_URL)
      
      this.mainConnection.onopen = () => this.handleOpen()
      this.mainConnection.onmessage = (event) => this.handleMessage(event)
      this.mainConnection.onerror = (error) => this.handleError(error)
      this.mainConnection.onclose = () => this.handleClose()
      
      // 等待连接建立
      await this.waitForConnection()
      
      // 启动心跳
      this.startHeartbeat()
      
      // 启动连接池维护
      this.startPoolMaintenance()
    } catch (error) {
      this.handleError(error as Error)
      throw error
    }
  }

  private async handleOpen(): Promise<void> {
    console.log('OpenClaw WebSocket connected')
    this.state.connected = true
    this.state.lastConnect = Date.now()
    this.state.reconnectAttempts = 0
    this.state.missedHeartbeats = 0
    
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
    
    await this.send(connectMsg as OpenClawMessage, 1) // 高优先级
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as OpenClawResponse | any
      
      // 更新统计信息
      this.state.messagesReceived++
      this.state.bytesReceived += event.data.length
      
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
      } else if (message.type === 'pong') {
        // 心跳响应
        this.handleHeartbeatResponse()
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
    
    // 清理心跳
    this.stopHeartbeat()
  }

  private async handleClose(): Promise<void> {
    console.log('OpenClaw WebSocket closed')
    this.state.connected = false
    this.state.authenticated = false
    
    // 清理心跳
    this.stopHeartbeat()
    
    // 安排重连
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    
    const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts), 30000)
    console.log(`Reconnecting in ${delay}ms... (attempt ${this.state.reconnectAttempts + 1})`)
    
    this.reconnectTimer = setTimeout(() => {
      this.state.reconnectAttempts++
      this.connect().catch(err => {
        console.error('Reconnect failed:', err)
      })
      this.reconnectTimer = null
    }, delay) as unknown as number
  }

  // 心跳机制
  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat()
    }, this.heartbeatConfig.interval) as unknown as number
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.mainConnection || this.mainConnection.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      const heartbeatMsg = {
        type: 'ping',
        timestamp: Date.now()
      }
      
      this.mainConnection.send(JSON.stringify(heartbeatMsg))
      this.state.lastHeartbeat = Date.now()
      
      // 等待心跳响应
      setTimeout(() => {
        if (Date.now() - this.state.lastHeartbeat > this.heartbeatConfig.timeout) {
          this.state.missedHeartbeats++
          
          if (this.state.missedHeartbeats >= this.heartbeatConfig.maxMissed) {
            console.error('Max missed heartbeats reached, reconnecting...')
            this.mainConnection?.close()
          }
        }
      }, this.heartbeatConfig.timeout)
    } catch (error) {
      console.error('Failed to send heartbeat:', error)
    }
  }

  private handleHeartbeatResponse(): void {
    this.state.missedHeartbeats = 0
  }

  // 连接池管理
  private async createConnection(): Promise<ConnectionInstance | null> {
    if (this.connectionPool.size >= this.poolConfig.maxSize) {
      return null
    }

    try {
      const ws = new WebSocket(this.config.GATEWAY_URL)
      const id = generateId()
      const now = Date.now()

      const instance: ConnectionInstance = {
        ws,
        id,
        createdAt: now,
        lastUsed: now,
        isActive: true
      }

      this.connectionPool.set(id, instance)
      this.state.poolSize = this.connectionPool.size
      
      return instance
    } catch (error) {
      console.error('Failed to create connection:', error)
      return null
    }
  }

  private async releaseConnection(id: string): Promise<void> {
    const instance = this.connectionPool.get(id)
    if (instance) {
      instance.isActive = false
      instance.lastUsed = Date.now()
    }
  }

  private startPoolMaintenance(): void {
    // 定期清理空闲连接
    setInterval(async () => {
      const now = Date.now()
      
      for (const [id, instance] of this.connectionPool) {
        // 清理超过最大生命周期的连接
        if (now - instance.createdAt > this.poolConfig.maxLifetime) {
          instance.ws.close()
          this.connectionPool.delete(id)
          continue
        }
        
        // 清理空闲连接（但保留最小数量）
        if (!instance.isActive && 
            now - instance.lastUsed > this.poolConfig.idleTimeout &&
            this.connectionPool.size > this.poolConfig.minSize) {
          instance.ws.close()
          this.connectionPool.delete(id)
        }
      }
      
      this.state.poolSize = this.connectionPool.size
    }, 60000) // 每分钟检查一次
  }

  async send(message: OpenClawMessage, priority: number = 0): Promise<OpenClawResponse> {
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
      
      if (this.mainConnection?.readyState === WebSocket.OPEN) {
        const data = JSON.stringify(message)
        this.mainConnection.send(data)
        
        // 更新统计信息
        this.state.messagesSent++
        this.state.bytesSent += data.length
      } else {
        // 加入消息队列
        this.messageQueue.push({ message, priority, resolve, reject })
        this.messageQueue.sort((a, b) => b.priority - a.priority) // 按优先级排序
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
    while (this.messageQueue.length > 0 && this.mainConnection?.readyState === WebSocket.OPEN) {
      const { message, resolve, reject } = this.messageQueue.shift()!
      
      try {
        const data = JSON.stringify(message)
        this.mainConnection.send(data)
        
        // 更新统计信息
        this.state.messagesSent++
        this.state.bytesSent += data.length
      } catch (error) {
        reject(error)
      }
      
      await sleep(50) // 减少延迟以提高吞吐量
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
    // 停止心跳
    this.stopHeartbeat()
    
    // 取消重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    // 关闭所有连接池连接
    for (const [id, instance] of this.connectionPool) {
      instance.ws.close()
      this.connectionPool.delete(id)
    }
    
    // 关闭主连接
    if (this.mainConnection) {
      this.mainConnection.close()
      this.mainConnection = null
    }
    
    // 重置状态
    this.state.connected = false
    this.state.authenticated = false
    this.state.poolSize = 0
    this.state.activeConnections = 0
  }

  getState(): ExtendedClientState {
    return { ...this.state }
  }

  // 获取统计信息
  getStats(): {
    connected: boolean
    authenticated: boolean
    poolSize: number
    messagesSent: number
    messagesReceived: number
    bytesSent: number
    bytesReceived: number
    lastHeartbeat: number
    missedHeartbeats: number
  } {
    return {
      connected: this.state.connected,
      authenticated: this.state.authenticated,
      poolSize: this.state.poolSize,
      messagesSent: this.state.messagesSent,
      messagesReceived: this.state.messagesReceived,
      bytesSent: this.state.bytesSent,
      bytesReceived: this.state.bytesReceived,
      lastHeartbeat: this.state.lastHeartbeat,
      missedHeartbeats: this.state.missedHeartbeats
    }
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