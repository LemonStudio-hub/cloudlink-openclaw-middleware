/**
 * OpenClaw 消息路由器
 */

import type { Env, ForumEvent, EventHandler, OpenClawEvent } from '../../../types'
import { OpenClawClient } from '../client'
import { generateId } from '../../../utils'

export class OpenClawRouter {
  private client: OpenClawClient | null = null
  private handlers: Map<string, EventHandler[]> = new Map()
  private eventQueue: ForumEvent[] = []
  private isProcessing = false

  constructor(env: Env) {
    this.client = new OpenClawClient(env)
    this.initializeEventHandlers()
  }

  private initializeEventHandlers(): void {
    // 注册默认事件处理器
    this.register('post_created', this.handlePostCreated.bind(this))
    this.register('comment_added', this.handleCommentAdded.bind(this))
    this.register('user_registered', this.handleUserRegistered.bind(this))
    this.register('notification_sent', this.handleNotificationSent.bind(this))
  }

  register(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
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

  async route(event: ForumEvent): Promise<void> {
    this.eventQueue.push(event)
    await this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!
        await this.processEvent(event)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async processEvent(event: ForumEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || []
    
    for (const handler of handlers) {
      try {
        await handler.handle(event)
      } catch (error) {
        console.error(`Handler error for ${event.type}:`, error)
      }
    }
  }

  async sendToOpenClaw(event: OpenClawEvent): Promise<any> {
    if (!this.client) {
      throw new Error('OpenClaw client not initialized')
    }

    return await this.client.sendAgentMessage(
      event.message,
      event.sessionId,
      event.thinking
    )
  }

  // 事件处理器
  private async handlePostCreated(event: ForumEvent): Promise<void> {
    const { title, author, content, category } = event.data
    
    const message = `📝 新帖子创建\n\n标题: ${title}\n作者: ${author}\n分类: ${category}\n\n内容: ${content.substring(0, 200)}...`
    
    await this.sendToOpenClaw({
      message,
      sessionId: 'system',
      thinking: 'low'
    })
  }

  private async handleCommentAdded(event: ForumEvent): Promise<void> {
    const { postTitle, author, content, postId } = event.data
    
    const message = `💬 新评论\n\n帖子: ${postTitle}\n评论者: ${author}\n\n内容: ${content.substring(0, 200)}...`
    
    await this.sendToOpenClaw({
      message,
      sessionId: 'system',
      thinking: 'low'
    })
  }

  private async handleUserRegistered(event: ForumEvent): Promise<void> {
    const { username, email } = event.data
    
    const message = `👤 新用户注册\n\n用户名: ${username}\n邮箱: ${email}\n\n欢迎加入云纽论坛！`
    
    await this.sendToOpenClaw({
      message,
      sessionId: 'system',
      thinking: 'low'
    })
  }

  private async handleNotificationSent(event: ForumEvent): Promise<void> {
    const { title, message: content, recipient } = event.data
    
    const message = `🔔 系统通知\n\n收件人: ${recipient}\n标题: ${title}\n\n${content}`
    
    await this.sendToOpenClaw({
      message,
      sessionId: 'system',
      thinking: 'low'
    })
  }

  get router() {
    return {
      '/event': async (c: any) => {
        const event = await c.req.json() as ForumEvent
        await this.route(event)
        return c.json({ success: true })
      },
      '/status': async (c: any) => {
        return c.json({
          connected: this.client?.getState().connected || false,
          queueLength: this.eventQueue.length,
          isProcessing: this.isProcessing
        })
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
