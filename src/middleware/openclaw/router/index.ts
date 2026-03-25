/**
 * OpenClaw 消息路由器（增强版）
 * 支持优先级处理、批量处理和并发控制
 */

import type { Env, ForumEvent, EventHandler, OpenClawEvent } from '../../../types'
import { OpenClawClient } from '../client'
import { generateId } from '../../../utils'

// 优先级级别
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

// 队列项
interface QueueItem {
  event: ForumEvent
  priority: EventPriority
  retryCount: number
  addedAt: number
}

// 路由器配置
export interface RouterConfig {
  maxConcurrentHandlers: number
  batchSize: number
  batchTimeout: number
  maxRetries: number
  retryDelay: number
  deadLetterQueueEnabled: boolean
}

// 统计信息
export interface RouterStats {
  totalEvents: number
  processedEvents: number
  failedEvents: number
  queuedEvents: number
  averageProcessingTime: number
  handlersByType: Map<string, number>
}

export class OpenClawRouter {
  private client: OpenClawClient
  private handlers: Map<string, EventHandler[]> = new Map()
  private eventQueue: QueueItem[] = []
  private deadLetterQueue: QueueItem[] = []
  private isProcessing = false
  private activeHandlers = 0
  private config: RouterConfig
  private stats: RouterStats
  private processingTimes: number[] = []

  constructor(env: Env, config?: Partial<RouterConfig>) {
    this.client = new OpenClawClient(env)
    this.config = {
      maxConcurrentHandlers: config?.maxConcurrentHandlers || 10,
      batchSize: config?.batchSize || 5,
      batchTimeout: config?.batchTimeout || 1000,
      maxRetries: config?.maxRetries || 3,
      retryDelay: config?.retryDelay || 5000,
      deadLetterQueueEnabled: config?.deadLetterQueueEnabled ?? true
    }
    
    this.stats = {
      totalEvents: 0,
      processedEvents: 0,
      failedEvents: 0,
      queuedEvents: 0,
      averageProcessingTime: 0,
      handlersByType: new Map()
    }
    
    this.initializeEventHandlers()
  }

  private initializeEventHandlers(): void {
    // 注册默认事件处理器
    this.register('post_created', { handle: this.handlePostCreated.bind(this) })
    this.register('comment_added', { handle: this.handleCommentAdded.bind(this) })
    this.register('user_registered', { handle: this.handleUserRegistered.bind(this) })
    this.register('notification_sent', { handle: this.handleNotificationSent.bind(this) })
  }

  register(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
      this.stats.handlersByType.set(eventType, 0)
    }
    this.handlers.get(eventType)?.push(handler)
  }

  unregister(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  async route(event: ForumEvent, priority: EventPriority = EventPriority.NORMAL): Promise<void> {
    this.stats.totalEvents++
    this.stats.queuedEvents++
    
    const queueItem: QueueItem = {
      event,
      priority,
      retryCount: 0,
      addedAt: Date.now()
    }
    
    // 按优先级插入队列
    this.insertByPriority(queueItem)
    
    // 触发处理
    await this.processQueue()
  }

  async routeBatch(events: ForumEvent[], defaultPriority: EventPriority = EventPriority.NORMAL): Promise<void> {
    for (const event of events) {
      await this.route(event, defaultPriority)
    }
  }

  private insertByPriority(item: QueueItem): void {
    // 找到插入位置（保持按优先级排序）
    let insertIndex = this.eventQueue.length
    
    for (let i = 0; i < this.eventQueue.length; i++) {
      if (this.eventQueue[i].priority < item.priority) {
        insertIndex = i
        break
      }
    }
    
    this.eventQueue.splice(insertIndex, 0, item)
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.activeHandlers >= this.config.maxConcurrentHandlers) {
      return
    }

    this.isProcessing = true

    try {
      // 批量处理
      const batch = this.getNextBatch()
      
      if (batch.length === 0) {
        return
      }

      // 并发处理批次
      const promises = batch.map(item => this.processEventItem(item))
      
      await Promise.allSettled(promises)
      
      // 如果还有事件，继续处理
      if (this.eventQueue.length > 0) {
        await this.processQueue()
      }
    } finally {
      this.isProcessing = false
    }
  }

  private getNextBatch(): QueueItem[] {
    const batch: QueueItem[] = []
    const startTime = Date.now()
    
    // 收集批次事件
    while (batch.length < this.config.batchSize && this.eventQueue.length > 0) {
      if (this.activeHandlers >= this.config.maxConcurrentHandlers) {
        break
      }
      
      batch.push(this.eventQueue.shift()!)
      this.activeHandlers++
      this.stats.queuedEvents--
    }
    
    // 等待更多事件以填充批次（超时控制）
    if (batch.length < this.config.batchSize && this.eventQueue.length > 0) {
      const elapsed = Date.now() - startTime
      if (elapsed < this.config.batchTimeout) {
        // 这里可以实现异步等待，但在 Cloudflare Workers 中不太适用
        // 实际应用中可以使用 queue 来处理
      }
    }
    
    return batch
  }

  private async processEventItem(item: QueueItem): Promise<void> {
    const startTime = Date.now()
    
    try {
      await this.processEvent(item.event)
      
      // 更新统计信息
      this.stats.processedEvents++
      this.stats.queuedEvents--
      
      const processingTime = Date.now() - startTime
      this.updateAverageProcessingTime(processingTime)
      
      // 更新类型统计
      const handlerCount = this.stats.handlersByType.get(item.event.type) || 0
      this.stats.handlersByType.set(item.event.type, handlerCount + 1)
      
    } catch (error) {
      console.error(`Error processing event ${item.event.id}:`, error)
      
      // 重试逻辑
      item.retryCount++
      
      if (item.retryCount < this.config.maxRetries) {
        // 延迟后重试
        setTimeout(async () => {
          this.eventQueue.push(item)
          await this.processQueue()
        }, this.config.retryDelay * item.retryCount)
      } else {
        // 超过最大重试次数，加入死信队列
        this.stats.failedEvents++
        
        if (this.config.deadLetterQueueEnabled) {
          this.deadLetterQueue.push(item)
          console.warn(`Event ${item.event.id} moved to dead letter queue`)
        }
      }
    } finally {
      this.activeHandlers--
    }
  }

  private async processEvent(event: ForumEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || []
    
    if (handlers.length === 0) {
      console.warn(`No handlers registered for event type: ${event.type}`)
      return
    }
    
    // 并发执行所有处理器
    const promises = handlers.map(handler => 
      handler.handle(event).catch(error => {
        console.error(`Handler error for ${event.type}:`, error)
        throw error
      })
    )
    
    await Promise.all(promises)
  }

  private updateAverageProcessingTime(time: number): void {
    this.processingTimes.push(time)
    
    // 只保留最近 100 个处理时间
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift()
    }
    
    const sum = this.processingTimes.reduce((a, b) => a + b, 0)
    this.stats.averageProcessingTime = sum / this.processingTimes.length
  }

  // 事件处理器
  private async handlePostCreated(event: ForumEvent): Promise<void> {
    const { title, author, content, category } = event.data

    const message = `📝 新帖子创建\n\n标题: ${title}\n作者: ${author}\n分类: ${category}\n\n内容: ${content.substring(0, 200)}...`

    return await this.client.sendAgentMessage(message, 'system', 'low')
  }

  private async handleCommentAdded(event: ForumEvent): Promise<void> {
    const { postTitle, author, content, postId } = event.data

    const message = `💬 新评论\n\n帖子: ${postTitle}\n评论者: ${author}\n\n内容: ${content.substring(0, 200)}...`

    return await this.client.sendAgentMessage(message, 'system', 'low')
  }

  private async handleUserRegistered(event: ForumEvent): Promise<void> {
    const { username, email } = event.data

    const message = `👤 新用户注册\n\n用户名: ${username}\n邮箱: ${email}\n\n欢迎加入云纽论坛！`

    return await this.client.sendAgentMessage(message, 'system', 'low')
  }

  private async handleNotificationSent(event: ForumEvent): Promise<void> {
    const { title, message: content, recipient } = event.data

    const message = `🔔 系统通知\n\n收件人: ${recipient}\n标题: ${title}\n\n${content}`

    return await this.client.sendAgentMessage(message, 'system', 'low')
  }

  // 死信队列管理
  async retryDeadLetterEvents(maxRetries: number = 3): Promise<number> {
    let retried = 0
    
    while (this.deadLetterQueue.length > 0 && retried < maxRetries) {
      const item = this.deadLetterQueue.shift()!
      item.retryCount = 0 // 重置重试计数
      
      this.eventQueue.push(item)
      retried++
    }
    
    if (retried > 0) {
      await this.processQueue()
    }
    
    return retried
  }

  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length
    this.deadLetterQueue = []
    return count
  }

  getDeadLetterQueue(): ForumEvent[] {
    return this.deadLetterQueue.map(item => item.event)
  }

  // 统计信息
  getStats(): RouterStats {
    return {
      totalEvents: this.stats.totalEvents,
      processedEvents: this.stats.processedEvents,
      failedEvents: this.stats.failedEvents,
      queuedEvents: this.stats.queuedEvents,
      averageProcessingTime: this.stats.averageProcessingTime,
      handlersByType: new Map(this.stats.handlersByType)
    }
  }

  get router() {
    return {
      '/event': async (c: any) => {
        const event = await c.req.json() as ForumEvent
        const priority = c.req.query('priority') ? parseInt(c.req.query('priority')) : EventPriority.NORMAL
        await this.route(event, priority)
        return c.json({ success: true })
      },
      '/batch': async (c: any) => {
        const events = await c.req.json() as ForumEvent[]
        const priority = c.req.query('priority') ? parseInt(c.req.query('priority')) : EventPriority.NORMAL
        await this.routeBatch(events, priority)
        return c.json({ success: true, processed: events.length })
      },
      '/status': async (c: any) => {
        return c.json({
          connected: this.client?.getState().connected || false,
          queueLength: this.eventQueue.length,
          deadLetterQueueLength: this.deadLetterQueue.length,
          isProcessing: this.isProcessing,
          activeHandlers: this.activeHandlers,
          stats: this.getStats()
        })
      },
      '/retry': async (c: any) => {
        const maxRetries = c.req.query('max') ? parseInt(c.req.query('max')) : 3
        const retried = await this.retryDeadLetterEvents(maxRetries)
        return c.json({ success: true, retried })
      },
      '/dead-letter': async (c: any) => {
        const events = this.getDeadLetterQueue()
        return c.json({ count: events.length, events })
      }
    }
  }

  async initialize(): Promise<void> {
    await this.client.connect()
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.disconnect()
    }
  }
}
