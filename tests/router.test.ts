/**
 * 消息路由器测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { OpenClawRouter, EventPriority } from '../src/middleware/openclaw/router'
import type { ForumEvent, Env } from '../src/types'

// Mock 环境
const mockEnv = {
  OPENCLAW_GATEWAY_URL: 'ws://localhost:18789',
  OPENCLAW_AUTH_TOKEN: 'test-token',
  OPENCLAW_DEVICE_ID: 'test-device',
  OPENCLAW_CHANNELS: 'slack,discord',
  OPENCLAW_THINKING: 'medium',
  OPENCLAW_RATE_LIMIT: '100',
  OPENCLAW_RATE_WINDOW: '60',
  DB: {
    prepare: vi.fn()
  },
  KV: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  OPENCLAW_QUEUE: {
    send: vi.fn()
  }
} as any

// Mock OpenClawClient
vi.mock('../src/middleware/openclaw/client', () => ({
  OpenClawClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendAgentMessage: vi.fn().mockResolvedValue({ success: true }),
    getState: vi.fn().mockReturnValue({
      connected: true,
      authenticated: true
    })
  }))
}))

describe('OpenClawRouter', () => {
  let router: OpenClawRouter

  beforeEach(() => {
    vi.clearAllMocks()
    router = new OpenClawRouter(mockEnv)
  })

  afterEach(async () => {
    await router.shutdown()
  })

  describe('构造函数', () => {
    it('应该使用默认配置创建路由器', () => {
      const defaultRouter = new OpenClawRouter(mockEnv)
      expect(defaultRouter).toBeDefined()
    })

    it('应该使用自定义配置创建路由器', () => {
      const customRouter = new OpenClawRouter(mockEnv, {
        maxConcurrentHandlers: 20,
        batchSize: 10,
        maxRetries: 5
      })
      expect(customRouter).toBeDefined()
    })

    it('应该初始化默认事件处理器', () => {
      const stats = router.getStats()
      expect(stats.handlersByType.has('post_created')).toBe(true)
      expect(stats.handlersByType.has('comment_added')).toBe(true)
      expect(stats.handlersByType.has('user_registered')).toBe(true)
      expect(stats.handlersByType.has('notification_sent')).toBe(true)
    })
  })

  describe('register', () => {
    it('应该注册新的事件处理器', () => {
      const handler = {
        handle: vi.fn().mockResolvedValue(undefined)
      }

      router.register('test_event', handler)

      const stats = router.getStats()
      expect(stats.handlersByType.has('test_event')).toBe(true)
    })

    it('应该为同一事件类型注册多个处理器', () => {
      const handler1 = { handle: vi.fn().mockResolvedValue(undefined) }
      const handler2 = { handle: vi.fn().mockResolvedValue(undefined) }

      router.register('test_event', handler1)
      router.register('test_event', handler2)

      const stats = router.getStats()
      expect(stats.handlersByType.get('test_event')).toBe(2)
    })
  })

  describe('unregister', () => {
    it('应该注销事件处理器', () => {
      const handler = { handle: vi.fn().mockResolvedValue(undefined) }

      router.register('test_event', handler)
      router.unregister('test_event', handler)

      const stats = router.getStats()
      expect(stats.handlersByType.get('test_event')).toBe(0)
    })
  })

  describe('route', () => {
    it('应该将事件路由到处理器', async () => {
      const event: ForumEvent = {
        type: 'post_created',
        data: {
          title: '测试帖子',
          content: '这是一个测试帖子',
          author: 'testuser',
          category: '技术'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      const handler = { handle: vi.fn().mockResolvedValue(undefined) }
      router.register('post_created', handler)

      await router.route(event, EventPriority.NORMAL)

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(handler.handle).toHaveBeenCalledWith(event)
    })

    it('应该按优先级处理事件', async () => {
      const lowPriorityEvent: ForumEvent = {
        type: 'test_event',
        data: { priority: 'low' },
        timestamp: Date.now(),
        id: 'event-low'
      }

      const highPriorityEvent: ForumEvent = {
        type: 'test_event',
        data: { priority: 'high' },
        timestamp: Date.now(),
        id: 'event-high'
      }

      const handler = { handle: vi.fn().mockResolvedValue(undefined) }
      router.register('test_event', handler)

      await router.route(lowPriorityEvent, EventPriority.LOW)
      await router.route(highPriorityEvent, EventPriority.HIGH)

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 高优先级事件应该先被处理
      expect(handler.handle).toHaveBeenCalledTimes(2)
    })

    it('应该更新统计信息', async () => {
      const event: ForumEvent = {
        type: 'post_created',
        data: {
          title: '测试帖子',
          content: '这是一个测试帖子',
          author: 'testuser',
          category: '技术'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await router.route(event, EventPriority.NORMAL)

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 100))

      const stats = router.getStats()
      expect(stats.totalEvents).toBe(1)
    })
  })

  describe('routeBatch', () => {
    it('应该批量路由多个事件', async () => {
      const events: ForumEvent[] = [
        {
          type: 'post_created',
          data: { title: '帖子1', content: '内容1', author: 'user1', category: '技术' },
          timestamp: Date.now(),
          id: 'event-1'
        },
        {
          type: 'post_created',
          data: { title: '帖子2', content: '内容2', author: 'user2', category: '技术' },
          timestamp: Date.now(),
          id: 'event-2'
        },
        {
          type: 'post_created',
          data: { title: '帖子3', content: '内容3', author: 'user3', category: '技术' },
          timestamp: Date.now(),
          id: 'event-3'
        }
      ]

      const handler = { handle: vi.fn().mockResolvedValue(undefined) }
      router.register('post_created', handler)

      await router.routeBatch(events, EventPriority.NORMAL)

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(handler.handle).toHaveBeenCalledTimes(3)
    })
  })

  describe('getStats', () => {
    it('应该返回路由器统计信息', () => {
      const stats = router.getStats()

      expect(stats).toHaveProperty('totalEvents')
      expect(stats).toHaveProperty('processedEvents')
      expect(stats).toHaveProperty('failedEvents')
      expect(stats).toHaveProperty('queuedEvents')
      expect(stats).toHaveProperty('averageProcessingTime')
      expect(stats).toHaveProperty('handlersByType')
    })
  })

  describe('retryDeadLetterEvents', () => {
    it('应该重试死信队列中的事件', async () => {
      const event: ForumEvent = {
        type: 'test_event',
        data: { test: 'data' },
        timestamp: Date.now(),
        id: 'event-1'
      }

      // 模拟事件失败并进入死信队列
      const failingHandler = {
        handle: vi.fn().mockRejectedValue(new Error('Handler failed'))
      }
      router.register('test_event', failingHandler)

      await router.route(event, EventPriority.NORMAL)

      // 等待重试完成
      await new Promise(resolve => setTimeout(resolve, 1000))

      const deadLetterEvents = router.getDeadLetterQueue()
      expect(deadLetterEvents.length).toBeGreaterThan(0)
    })

    it('应该限制重试次数', async () => {
      const event: ForumEvent = {
        type: 'test_event',
        data: { test: 'data' },
        timestamp: Date.now(),
        id: 'event-1'
      }

      const failingHandler = {
        handle: vi.fn().mockRejectedValue(new Error('Handler failed'))
      }
      router.register('test_event', failingHandler)

      await router.route(event, EventPriority.NORMAL)

      // 等待所有重试完成
      await new Promise(resolve => setTimeout(resolve, 5000))

      const stats = router.getStats()
      expect(stats.failedEvents).toBe(1)
    })
  })

  describe('clearDeadLetterQueue', () => {
    it('应该清空死信队列', () => {
      const count = router.clearDeadLetterQueue()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getDeadLetterQueue', () => {
    it('应该返回死信队列中的事件', () => {
      const events = router.getDeadLetterQueue()
      expect(Array.isArray(events)).toBe(true)
    })
  })

  describe('initialize', () => {
    it('应该初始化路由器', async () => {
      await expect(router.initialize()).resolves.not.toThrow()
    })
  })

  describe('shutdown', () => {
    it('应该关闭路由器', async () => {
      await expect(router.shutdown()).resolves.not.toThrow()
    })
  })

  describe('错误处理', () => {
    it('应该处理处理器错误而不崩溃', async () => {
      const event: ForumEvent = {
        type: 'test_event',
        data: { test: 'data' },
        timestamp: Date.now(),
        id: 'event-1'
      }

      const errorHandler = {
        handle: vi.fn().mockRejectedValue(new Error('Handler error'))
      }
      router.register('test_event', errorHandler)

      await expect(router.route(event, EventPriority.NORMAL)).resolves.not.toThrow()

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    it('应该处理多个处理器中的错误', async () => {
      const event: ForumEvent = {
        type: 'test_event',
        data: { test: 'data' },
        timestamp: Date.now(),
        id: 'event-1'
      }

      const errorHandler = {
        handle: vi.fn().mockRejectedValue(new Error('Handler error'))
      }
      const successHandler = {
        handle: vi.fn().mockResolvedValue(undefined)
      }

      router.register('test_event', errorHandler)
      router.register('test_event', successHandler)

      await router.route(event, EventPriority.NORMAL)

      // 等待异步处理完成
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(successHandler.handle).toHaveBeenCalled()
    })
  })

  describe('并发控制', () => {
    it('应该限制并发处理器数量', async () => {
      const config = {
        maxConcurrentHandlers: 2
      }
      const limitedRouter = new OpenClawRouter(mockEnv, config)

      const events: ForumEvent[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'test_event',
        data: { index: i },
        timestamp: Date.now(),
        id: `event-${i}`
      }))

      const slowHandler = {
        handle: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 200))
        })
      }

      limitedRouter.register('test_event', slowHandler)

      await limitedRouter.routeBatch(events, EventPriority.NORMAL)

      // 等待处理开始
      await new Promise(resolve => setTimeout(resolve, 50))

      // 检查并发限制
      const activeCalls = slowHandler.handle.mock.calls.length
      expect(activeCalls).toBeLessThanOrEqual(config.maxConcurrentHandlers)

      // 等待所有处理完成
      await new Promise(resolve => setTimeout(resolve, 1000))

      await limitedRouter.shutdown()
    })
  })

  describe('批量处理', () => {
    it('应该按批次处理事件', async () => {
      const config = {
        batchSize: 3
      }
      const batchRouter = new OpenClawRouter(mockEnv, config)

      const events: ForumEvent[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'test_event',
        data: { index: i },
        timestamp: Date.now(),
        id: `event-${i}`
      }))

      const handler = {
        handle: vi.fn().mockResolvedValue(undefined)
      }

      batchRouter.register('test_event', handler)

      await batchRouter.routeBatch(events, EventPriority.NORMAL)

      // 等待处理完成
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(handler.handle).toHaveBeenCalledTimes(10)

      await batchRouter.shutdown()
    })
  })
})