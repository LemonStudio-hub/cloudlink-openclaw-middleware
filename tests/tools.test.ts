/**
 * 工具集测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SearchTool, CreateTool, StatsTool, ManagementTool, ToolRegistry } from '../src/middleware/openclaw/tools'
import type { Env } from '../src/types'

// 创建模拟的语句执行器
const mockStatement = () => ({
  bind: vi.fn().mockReturnThis(),
  first: vi.fn().mockResolvedValue(null),
  all: vi.fn().mockResolvedValue([]),
  run: vi.fn().mockResolvedValue({ meta: { rows_read: 0, rows_written: 0 } })
})

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
    prepare: vi.fn(mockStatement)
  },
  KV: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  },
  OPENCLAW_QUEUE: {
    send: vi.fn().mockResolvedValue(undefined)
  }
} as any

// Mock OpenClawClient
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  sendAgentMessage: vi.fn().mockResolvedValue({ success: true }),
  getState: vi.fn().mockReturnValue({
    connected: true,
    authenticated: true
  })
}

// 辅助函数：创建模拟的语句
function createMockStatement(options: {
  first?: any
  all?: any
  run?: any
}) {
  return {
    bind: vi.fn().mockReturnThis(),
    first: options.first !== undefined ? vi.fn().mockResolvedValue(options.first) : vi.fn().mockResolvedValue(null),
    all: options.all !== undefined ? vi.fn().mockResolvedValue(options.all) : vi.fn().mockResolvedValue([]),
    run: options.run !== undefined ? vi.fn().mockResolvedValue(options.run) : vi.fn().mockResolvedValue({ meta: { rows_read: 0, rows_written: 0 } })
  }
}

describe('SearchTool', () => {
  let tool: SearchTool

  beforeEach(() => {
    vi.clearAllMocks()
    tool = new SearchTool(mockEnv, mockClient as any)
  })

  describe('搜索帖子', () => {
    it('应该成功搜索帖子', async () => {
      const mockResults = [
        { id: 'post-1', title: '测试帖子1', content: '内容1' },
        { id: 'post-2', title: '测试帖子2', content: '内容2' }
      ]

      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: mockResults })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 2 })
        })

      const result = await tool.handler({
        query: '测试',
        type: 'posts',
        limit: 10,
        offset: 0
      }, mockEnv)

      expect(result.results).toEqual(mockResults)
      expect(result.total).toBe(2)
      expect(result.query).toBe('测试')
      expect(result.type).toBe('posts')
    })

    it('应该支持过滤条件', async () => {
      const mockResults = [{ id: 'post-1', title: '技术帖子' }]

      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: mockResults })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 1 })
        })

      await tool.handler({
        query: '技术',
        type: 'posts',
        filters: {
          categoryId: 'cat-1',
          status: 'published'
        }
      }, mockEnv)

      const callArgs = mockEnv.DB.prepare.mock.calls[0]
      expect(callArgs[0]).toContain('categoryId = ?')
      expect(callArgs[0]).toContain('status = ?')
    })
  })

  describe('搜索用户', () => {
    it('应该成功搜索用户', async () => {
      const mockResults = [
        { id: 'user-1', username: 'testuser1', email: 'test1@example.com' },
        { id: 'user-2', username: 'testuser2', email: 'test2@example.com' }
      ]

      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: mockResults })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 2 })
        })

      const result = await tool.handler({
        query: 'test',
        type: 'users'
      }, mockEnv)

      expect(result.results).toEqual(mockResults)
      expect(result.total).toBe(2)
    })

    it('应该支持按角色过滤', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: [] })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 0 })
        })

      await tool.handler({
        query: 'test',
        type: 'users',
        filters: {
          role: 'moderator'
        }
      }, mockEnv)

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('role = ?'),
        expect.any(Array)
      )
    })
  })

  describe('搜索评论', () => {
    it('应该成功搜索评论', async () => {
      const mockResults = [
        { id: 'comment-1', content: '测试评论1' },
        { id: 'comment-2', content: '测试评论2' }
      ]

      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: mockResults })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 2 })
        })

      const result = await tool.handler({
        query: '测试',
        type: 'comments'
      }, mockEnv)

      expect(result.results).toEqual(mockResults)
      expect(result.total).toBe(2)
    })
  })

  describe('搜索标签', () => {
    it('应该成功搜索标签', async () => {
      const mockResults = [
        { name: 'typescript', post_count: 10 },
        { name: 'testing', post_count: 5 }
      ]

      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: mockResults })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 2 })
        })

      const result = await tool.handler({
        query: 'test',
        type: 'tags'
      }, mockEnv)

      expect(result.results).toEqual(mockResults)
      expect(result.total).toBe(2)
    })
  })

  describe('综合搜索', () => {
    it('应该搜索所有类型的内容', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: [{ id: 'post-1' }] })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 1 })
        })
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: [{ id: 'user-1' }] })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 1 })
        })
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({ results: [{ id: 'comment-1' }] })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 1 })
        })

      const result = await tool.handler({
        query: 'test',
        type: 'all'
      }, mockEnv)

      expect(result.results).toHaveLength(3)
      expect(result.results[0].type).toBe('post')
      expect(result.results[1].type).toBe('user')
      expect(result.results[2].type).toBe('comment')
    })
  })
})

describe('CreateTool', () => {
  let tool: CreateTool

  beforeEach(() => {
    vi.clearAllMocks()
    tool = new CreateTool(mockEnv, mockClient as any)
  })

  describe('创建帖子', () => {
    it('应该成功创建帖子', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ id: 'cat-1', name: '技术' })
        })
        .mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ success: true })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue(null)
        })
        .mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ success: true })
        })
        .mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ success: true })
        })

      const result = await tool.handler({
        type: 'post',
        data: {
          title: '测试帖子',
          content: '这是一个测试帖子',
          categoryId: 'cat-1',
          tags: ['typescript', 'testing'],
          authorId: 'user-1'
        }
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.type).toBe('post')
      expect(result.result.id).toBeDefined()
      expect(result.result.status).toBe('published')
    })

    it('应该在分类不存在时抛出错误', async () => {
      mockEnv.DB.prepare.mockReturnValue(createMockStatement({ first: null }))

      await expect(tool.handler({
        type: 'post',
        data: {
          title: '测试帖子',
          content: '内容',
          categoryId: 'invalid-cat',
          authorId: 'user-1'
        }
      }, mockEnv)).rejects.toThrow('Category not found')
    })
  })

  describe('创建评论', () => {
    it('应该成功创建评论', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ id: 'post-1' })
        })
        .mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ success: true })
        })

      const result = await tool.handler({
        type: 'comment',
        data: {
          postId: 'post-1',
          content: '这是一个测试评论',
          authorId: 'user-1'
        }
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.id).toBeDefined()
      expect(result.result.status).toBe('pending')
    })

    it('应该在帖子不存在时抛出错误', async () => {
      mockEnv.DB.prepare.mockReturnValue(createMockStatement({ first: null }))

      await expect(tool.handler({
        type: 'comment',
        data: {
          postId: 'invalid-post',
          content: '评论内容',
          authorId: 'user-1'
        }
      }, mockEnv)).rejects.toThrow('Post not found')
    })
  })

  describe('创建分类', () => {
    it('应该成功创建分类', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await tool.handler({
        type: 'category',
        data: {
          name: '技术',
          description: '技术相关讨论'
        }
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.id).toBeDefined()
      expect(result.result.name).toBe('技术')
    })
  })

  describe('创建标签', () => {
    it('应该成功创建新标签', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue(null)
        })
        .mockReturnValueOnce({
          run: vi.fn().mockResolvedValue({ success: true })
        })

      const result = await tool.handler({
        type: 'tag',
        data: {
          name: 'typescript',
          description: 'TypeScript 相关'
        }
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.exists).toBe(false)
    })

    it('应该返回已存在的标签', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'typescript' })
      })

      const result = await tool.handler({
        type: 'tag',
        data: {
          name: 'typescript'
        }
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.exists).toBe(true)
    })
  })
})

describe('StatsTool', () => {
  let tool: StatsTool

  beforeEach(() => {
    vi.clearAllMocks()
    tool = new StatsTool(mockEnv, mockClient as any)
  })

  describe('用户统计', () => {
    it('应该返回用户统计信息', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          total: 100,
          new_users: 10,
          regular_users: 80,
          moderators: 15,
          admins: 5
        })
      })

      const result = await tool.handler({
        type: 'users',
        period: 'week'
      }, mockEnv)

      expect(result.result.total).toBe(100)
      expect(result.result.newUsers).toBe(10)
      expect(result.result.regularUsers).toBe(80)
      expect(result.result.moderators).toBe(15)
      expect(result.result.admins).toBe(5)
    })
  })

  describe('帖子统计', () => {
    it('应该返回帖子统计信息', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          total: 500,
          new_posts: 50,
          published: 450,
          drafts: 40,
          archived: 10,
          avg_content_length: 1000
        })
      })

      const result = await tool.handler({
        type: 'posts',
        period: 'month'
      }, mockEnv)

      expect(result.result.total).toBe(500)
      expect(result.result.newPosts).toBe(50)
      expect(result.result.published).toBe(450)
      expect(result.result.avgContentLength).toBe(1000)
    })
  })

  describe('评论统计', () => {
    it('应该返回评论统计信息', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          total: 2000,
          new_comments: 200,
          approved: 1800,
          pending: 150,
          rejected: 50,
          avg_content_length: 200
        })
      })

      const result = await tool.handler({
        type: 'comments'
      }, mockEnv)

      expect(result.result.total).toBe(2000)
      expect(result.result.newComments).toBe(200)
      expect(result.result.approved).toBe(1800)
    })
  })

  describe('活动统计', () => {
    it('应该返回活动统计信息', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 10 })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 100 })
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ count: 5 })
        })

      const result = await tool.handler({
        type: 'activity',
        period: 'day'
      }, mockEnv)

      expect(result.result.newPosts).toBe(10)
      expect(result.result.newComments).toBe(100)
      expect(result.result.activeUsers).toBe(5)
      expect(result.result.totalActivity).toBe(110)
    })
  })

  describe('趋势统计', () => {
    it('应该返回趋势统计信息', async () => {
      mockEnv.DB.prepare
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({
            results: [
              { date: '2026-03-20', posts: 5 },
              { date: '2026-03-21', posts: 8 }
            ]
          })
        })
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({
            results: [
              { name: 'typescript', count: 15 },
              { name: 'testing', count: 10 }
            ]
          })
        })
        .mockReturnValueOnce({
          all: vi.fn().mockResolvedValue({
            results: [
              { username: 'user1', post_count: 3, comment_count: 5 },
              { username: 'user2', post_count: 2, comment_count: 3 }
            ]
          })
        })

      const result = await tool.handler({
        type: 'trends',
        period: 'week'
      }, mockEnv)

      expect(result.result.dailyPosts).toHaveLength(2)
      expect(result.result.popularTags).toHaveLength(2)
      expect(result.result.activeUsers).toHaveLength(2)
    })
  })
})

describe('ManagementTool', () => {
  let tool: ManagementTool

  beforeEach(() => {
    vi.clearAllMocks()
    tool = new ManagementTool(mockEnv, mockClient as any)
  })

  describe('审核操作', () => {
    it('应该通过帖子审核', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await tool.handler({
        action: 'approve',
        targetType: 'post',
        targetId: 'post-1'
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.status).toBe('approved')
    })

    it('应该拒绝帖子审核', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await tool.handler({
        action: 'reject',
        targetType: 'post',
        targetId: 'post-1',
        reason: '内容不符合规范'
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.status).toBe('rejected')
      expect(result.result.reason).toBe('内容不符合规范')
    })
  })

  describe('删除操作', () => {
    it('应该删除帖子', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await tool.handler({
        action: 'delete',
        targetType: 'post',
        targetId: 'post-1',
        reason: '违规内容'
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.deleted).toBe(true)
    })
  })

  describe('用户管理', () => {
    it('应该封禁用户', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await tool.handler({
        action: 'ban',
        targetType: 'user',
        targetId: 'user-1',
        reason: '多次违规'
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.status).toBe('banned')
    })

    it('应该解封用户', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await tool.handler({
        action: 'unban',
        targetType: 'user',
        targetId: 'user-1'
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.status).toBe('active')
    })

    it('应该更新用户角色', async () => {
      mockEnv.DB.prepare.mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true })
      })

      const result = await tool.handler({
        action: 'update_role',
        targetType: 'user',
        targetId: 'user-1',
        roleId: 'moderator'
      }, mockEnv)

      expect(result.success).toBe(true)
      expect(result.result.role).toBe('moderator')
    })
  })
})

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    registry = new ToolRegistry(mockEnv, mockClient as any)
  })

  describe('工具注册', () => {
    it('应该注册默认工具', () => {
      const allTools = registry.getAll()

      expect(allTools).toHaveLength(4)
      expect(allTools.map(t => t.name)).toContain('search')
      expect(allTools.map(t => t.name)).toContain('create')
      expect(allTools.map(t => t.name)).toContain('stats')
      expect(allTools.map(t => t.name)).toContain('manage')
    })

    it('应该获取工具', () => {
      const searchTool = registry.get('search')

      expect(searchTool).toBeDefined()
      expect(searchTool!.name).toBe('search')
    })

    it('应该获取工具 Schema', () => {
      const schemas = registry.getSchema()

      expect(schemas).toHaveLength(4)
      expect(schemas[0]).toHaveProperty('name')
      expect(schemas[0]).toHaveProperty('description')
      expect(schemas[0]).toHaveProperty('parameters')
    })
  })

  describe('工具注销', () => {
    it('应该注销工具', () => {
      const searchTool = registry.get('search')
      expect(searchTool).toBeDefined()

      registry.unregister('search')

      const removedTool = registry.get('search')
      expect(removedTool).toBeUndefined()
    })
  })
})