/**
 * 数据转换器测试
 */

import { describe, it, expect } from 'vitest'
import { DataTransformer, SchemaValidator, ProtocolAdapter, ForumPost, ForumComment, ForumUser, ForumNotification } from '../src/middleware/openclaw/transformer'

describe('SchemaValidator', () => {
  describe('validatePost', () => {
    it('应该验证有效的帖子数据', () => {
      const post = {
        id: 'post-1',
        title: '测试帖子',
        content: '这是一个测试帖子',
        author: {
          id: 'user-1',
          username: 'testuser'
        },
        category: {
          id: 'cat-1',
          name: '技术'
        }
      }

      const result = SchemaValidator.validatePost(post)
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('应该拒绝缺少必需字段的帖子数据', () => {
      const post = {
        id: 'post-1',
        title: '测试帖子'
        // 缺少 content, author, category
      }

      const result = SchemaValidator.validatePost(post)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('应该验证类型', () => {
      expect(SchemaValidator.validateType('string', 'string')).toBe(true)
      expect(SchemaValidator.validateType('number', 123)).toBe(true)
      expect(SchemaValidator.validateType('boolean', true)).toBe(true)
      expect(SchemaValidator.validateType('array', [1, 2, 3])).toBe(true)
      expect(SchemaValidator.validateType('object', {})).toBe(true)
      expect(SchemaValidator.validateType('string', 123)).toBe(false)
      expect(SchemaValidator.validateType('number', '123')).toBe(false)
    })
  })

  describe('validateComment', () => {
    it('应该验证有效的评论数据', () => {
      const comment = {
        id: 'comment-1',
        postId: 'post-1',
        content: '这是一个测试评论',
        author: {
          id: 'user-1',
          username: 'testuser'
        }
      }

      const result = SchemaValidator.validateComment(comment)
      expect(result.valid).toBe(true)
    })

    it('应该拒绝缺少必需字段的评论数据', () => {
      const comment = {
        id: 'comment-1',
        postId: 'post-1'
        // 缺少 content, author
      }

      const result = SchemaValidator.validateComment(comment)
      expect(result.valid).toBe(false)
    })
  })

  describe('validateUser', () => {
    it('应该验证有效的用户数据', () => {
      const user = {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      }

      const result = SchemaValidator.validateUser(user)
      expect(result.valid).toBe(true)
    })

    it('应该拒绝缺少必需字段的用户数据', () => {
      const user = {
        id: 'user-1',
        username: 'testuser'
        // 缺少 email
      }

      const result = SchemaValidator.validateUser(user)
      expect(result.valid).toBe(false)
    })
  })
})

describe('DataTransformer', () => {
  describe('postToOpenClawMessage', () => {
    it('应该将帖子转换为 OpenClaw 消息格式', () => {
      const post: ForumPost = {
        id: 'post-1',
        title: '测试帖子',
        content: '这是一个测试帖子',
        author: {
          id: 'user-1',
          username: 'testuser'
        },
        category: {
          id: 'cat-1',
          name: '技术'
        },
        tags: ['typescript', 'testing'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'published'
      }

      const result = DataTransformer.postToOpenClawMessage(post)

      expect(result.type).toBe('markdown')
      expect(result.content).toContain('测试帖子')
      expect(result.content).toContain('testuser')
      expect(result.content).toContain('技术')
      expect(result.content).toContain('#typescript')
      expect(result.content).toContain('#testing')
      expect(result.metadata).toBeDefined()
    })

    it('应该提取提及', () => {
      const post: ForumPost = {
        id: 'post-1',
        title: '测试帖子',
        content: 'Hello @user1 and @user2',
        author: {
          id: 'user-1',
          username: 'testuser'
        },
        category: {
          id: 'cat-1',
          name: '技术'
        },
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'published'
      }

      const result = DataTransformer.postToOpenClawMessage(post)

      expect(result.metadata?.mentions).toContain('user1')
      expect(result.metadata?.mentions).toContain('user2')
    })

    it('应该提取表情符号', () => {
      const post: ForumPost = {
        id: 'post-1',
        title: '测试帖子',
        content: 'Hello 🌍 and 🚀',
        author: {
          id: 'user-1',
          username: 'testuser'
        },
        category: {
          id: 'cat-1',
          name: '技术'
        },
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'published'
      }

      const result = DataTransformer.postToOpenClawMessage(post)

      expect(result.metadata?.emojis).toContain('🌍')
      expect(result.metadata?.emojis).toContain('🚀')
    })
  })

  describe('commentToOpenClawMessage', () => {
    it('应该将评论转换为 OpenClaw 消息格式', () => {
      const comment: ForumComment = {
        id: 'comment-1',
        postId: 'post-1',
        content: '这是一个测试评论',
        author: {
          id: 'user-1',
          username: 'testuser'
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'approved'
      }

      const result = DataTransformer.commentToOpenClawMessage(comment, '测试帖子')

      expect(result.type).toBe('markdown')
      expect(result.content).toContain('测试帖子')
      expect(result.content).toContain('testuser')
      expect(result.content).toContain('这是一个测试评论')
    })
  })

  describe('userToOpenClawMessage', () => {
    it('应该将用户转换为 OpenClaw 消息格式', () => {
      const user: ForumUser = {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        avatar: 'avatar.png',
        bio: '这是一个测试用户',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        role: 'user'
      }

      const result = DataTransformer.userToOpenClawMessage(user)

      expect(result.type).toBe('markdown')
      expect(result.content).toContain('testuser')
      expect(result.content).toContain('test@example.com')
      expect(result.content).toContain('普通用户')
      expect(result.content).toContain('这是一个测试用户')
    })
  })

  describe('notificationToOpenClawMessage', () => {
    it('应该将通知转换为 OpenClaw 消息格式', () => {
      const notification: ForumNotification = {
        id: 'notif-1',
        recipient: 'user-1',
        title: '测试通知',
        message: '这是一个测试通知',
        type: 'info',
        priority: 'normal',
        read: false,
        createdAt: Date.now()
      }

      const result = DataTransformer.notificationToOpenClawMessage(notification)

      expect(result.type).toBe('markdown')
      expect(result.content).toContain('测试通知')
      expect(result.content).toContain('这是一个测试通知')
      expect(result.content).toContain('user-1')
      expect(result.content).toContain('normal')
    })

    it('应该显示正确的优先级表情符号', () => {
      const notification: ForumNotification = {
        id: 'notif-1',
        recipient: 'user-1',
        title: '紧急通知',
        message: '这是一个紧急通知',
        type: 'error',
        priority: 'urgent',
        read: false,
        createdAt: Date.now()
      }

      const result = DataTransformer.notificationToOpenClawMessage(notification)

      expect(result.content).toContain('❤️')
      expect(result.content).toContain('❌')
    })
  })

  describe('openClawMessageToForumEvent', () => {
    it('应该将 OpenClaw 消息转换为论坛事件', () => {
      const message = {
        type: 'markdown' as const,
        content: '测试消息',
        metadata: {
          mentions: ['user1'],
          emojis: ['🌍']
        }
      }

      const result = DataTransformer.openClawMessageToForumEvent(message, 'test_event', { additional: 'data' })

      expect(result.type).toBe('test_event')
      expect(result.data.message).toBe('测试消息')
      expect(result.data.metadata).toEqual(message.metadata)
      expect(result.data.additional).toBe('data')
      expect(result.timestamp).toBeDefined()
      expect(result.id).toBeDefined()
    })
  })
})

describe('ProtocolAdapter', () => {
  describe('isVersionSupported', () => {
    it('应该支持已知的版本', () => {
      expect(ProtocolAdapter.isVersionSupported('1.0.0')).toBe(true)
      expect(ProtocolAdapter.isVersionSupported('0.9.0')).toBe(true)
    })

    it('不应该支持未知的版本', () => {
      expect(ProtocolAdapter.isVersionSupported('2.0.0')).toBe(false)
      expect(ProtocolAdapter.isVersionSupported('0.8.0')).toBe(false)
    })
  })

  describe('adaptToVersion', () => {
    it('应该适配到当前版本', () => {
      const data = {
        message: 'test',
        metadata: {
          mentions: ['user1']
        }
      }

      const result = ProtocolAdapter.adaptToVersion(data, '1.0.0')

      expect(result).toEqual(data)
    })

    it('应该降级到旧版本', () => {
      const data = {
        message: 'test',
        metadata: {
          mentions: ['user1'],
          emojis: ['🌍']
        }
      }

      const result = ProtocolAdapter.adaptToVersion(data, '0.9.0')

      // 降级版本应该移除 mentions 和 emojis
      expect(result.metadata).not.toHaveProperty('mentions')
      expect(result.metadata).not.toHaveProperty('emojis')
    })

    it('应该拒绝不支持的版本', () => {
      expect(() => {
        ProtocolAdapter.adaptToVersion({}, '2.0.0')
      }).toThrow()
    })
  })

  describe('adaptError', () => {
    it('应该适配 Error 对象', () => {
      const error = new Error('测试错误')

      const result = ProtocolAdapter.adaptError(error)

      expect(result.code).toBe('INTERNAL_ERROR')
      expect(result.message).toBe('测试错误')
      expect(result.details).toBeDefined()
      expect(result.details?.name).toBe('Error')
      expect(result.details?.stack).toBeDefined()
    })

    it('应该适配普通对象错误', () => {
      const error = {
        code: 'CUSTOM_ERROR',
        message: '自定义错误',
        details: { info: 'extra info' }
      }

      const result = ProtocolAdapter.adaptError(error)

      expect(result.code).toBe('CUSTOM_ERROR')
      expect(result.message).toBe('自定义错误')
      expect(result.details).toEqual({ info: 'extra info' })
    })

    it('应该适配字符串错误', () => {
      const error = '字符串错误'

      const result = ProtocolAdapter.adaptError(error)

      expect(result.code).toBe('UNKNOWN_ERROR')
      expect(result.message).toBe('字符串错误')
    })
  })
})