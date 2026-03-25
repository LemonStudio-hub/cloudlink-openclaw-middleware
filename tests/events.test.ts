/**
 * 事件处理器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PostEventHandler, CommentEventHandler, UserEventHandler, NotificationEventHandler } from '../src/middleware/openclaw/events'
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
const mockClient = {
  sendAgentMessage: vi.fn().mockResolvedValue({ success: true })
}

describe('PostEventHandler', () => {
  let handler: PostEventHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new PostEventHandler(mockClient as any)
  })

  describe('handlePostCreated', () => {
    it('应该处理帖子创建事件', async () => {
      const event: ForumEvent = {
        type: 'post_created',
        data: {
          id: 'post-1',
          title: '测试帖子',
          content: '这是一个测试帖子',
          author: {
            id: 'user-1',
            username: 'testuser',
            avatar: 'avatar.png'
          },
          category: {
            id: 'cat-1',
            name: '技术'
          },
          tags: ['typescript', 'testing'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'published'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('新帖子创建')
      expect(callArgs[0]).toContain('测试帖子')
      expect(callArgs[0]).toContain('testuser')
      expect(callArgs[0]).toContain('技术')
    })
  })

  describe('handlePostUpdated', () => {
    it('应该处理帖子更新事件', async () => {
      const event: ForumEvent = {
        type: 'post_updated',
        data: {
          post: {
            id: 'post-1',
            title: '更新后的标题'
          },
          changes: {
            title: '新标题',
            content: '新内容'
          }
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('帖子更新')
      expect(callArgs[0]).toContain('title')
      expect(callArgs[0]).toContain('content')
    })
  })

  describe('handlePostDeleted', () => {
    it('应该处理帖子删除事件', async () => {
      const event: ForumEvent = {
        type: 'post_deleted',
        data: {
          post: {
            id: 'post-1',
            title: '已删除的帖子',
            author: {
              username: 'testuser'
            }
          },
          deletedBy: 'admin'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('帖子删除')
      expect(callArgs[0]).toContain('已删除的帖子')
      expect(callArgs[0]).toContain('admin')
    })
  })

  describe('handlePostModeration', () => {
    it('应该处理帖子审核通过事件', async () => {
      const event: ForumEvent = {
        type: 'post_approved',
        data: {
          post: {
            id: 'post-1',
            title: '审核的帖子',
            author: {
              username: 'testuser'
            }
          },
          status: 'approved',
          moderator: 'admin',
          reason: '内容符合规范'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('✅')
      expect(callArgs[0]).toContain('审核已批准')
    })

    it('应该处理帖子审核拒绝事件', async () => {
      const event: ForumEvent = {
        type: 'post_rejected',
        data: {
          post: {
            id: 'post-1',
            title: '审核的帖子',
            author: {
              username: 'testuser'
            }
          },
          status: 'rejected',
          moderator: 'admin',
          reason: '内容不符合规范'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('❌')
      expect(callArgs[0]).toContain('审核已拒绝')
    })
  })
})

describe('CommentEventHandler', () => {
  let handler: CommentEventHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new CommentEventHandler(mockClient as any)
  })

  describe('handleCommentAdded', () => {
    it('应该处理评论添加事件', async () => {
      const event: ForumEvent = {
        type: 'comment_added',
        data: {
          comment: {
            id: 'comment-1',
            content: '这是一个测试评论',
            author: {
              id: 'user-1',
              username: 'testuser'
            }
          },
          post: {
            id: 'post-1',
            title: '测试帖子'
          }
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('新评论')
      expect(callArgs[0]).toContain('测试帖子')
      expect(callArgs[0]).toContain('testuser')
    })
  })

  describe('handleCommentUpdated', () => {
    it('应该处理评论更新事件', async () => {
      const event: ForumEvent = {
        type: 'comment_updated',
        data: {
          comment: {
            id: 'comment-1'
          },
          post: {
            title: '测试帖子'
          },
          changes: {
            content: '更新后的内容'
          }
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('评论更新')
    })
  })

  describe('handleCommentDeleted', () => {
    it('应该处理评论删除事件', async () => {
      const event: ForumEvent = {
        type: 'comment_deleted',
        data: {
          comment: {
            id: 'comment-1',
            author: {
              username: 'testuser'
            }
          },
          post: {
            title: '测试帖子'
          },
          deletedBy: 'admin'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('评论删除')
    })
  })

  describe('handleCommentLiked', () => {
    it('应该处理评论点赞事件', async () => {
      const event: ForumEvent = {
        type: 'comment_liked',
        data: {
          comment: {
            id: 'comment-1',
            author: {
              username: 'testuser'
            }
          },
          post: {
            title: '测试帖子'
          },
          likedBy: 'user2',
          likeCount: 5
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('❤️')
      expect(callArgs[0]).toContain('评论点赞')
      expect(callArgs[0]).toContain('5')
    })
  })

  describe('handleCommentModeration', () => {
    it('应该处理评论审核通过事件', async () => {
      const event: ForumEvent = {
        type: 'comment_approved',
        data: {
          comment: {
            id: 'comment-1',
            author: {
              username: 'testuser'
            }
          },
          post: {
            title: '测试帖子'
          },
          status: 'approved',
          moderator: 'admin'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('✅')
    })
  })
})

describe('UserEventHandler', () => {
  let handler: UserEventHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UserEventHandler(mockClient as any)
  })

  describe('handleUserRegistered', () => {
    it('应该处理用户注册事件', async () => {
      const event: ForumEvent = {
        type: 'user_registered',
        data: {
          id: 'user-1',
          username: 'newuser',
          email: 'newuser@example.com',
          avatar: 'avatar.png',
          bio: '这是一个新用户',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          role: 'user'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('新用户注册')
      expect(callArgs[0]).toContain('newuser')
      expect(callArgs[0]).toContain('newuser@example.com')
      expect(callArgs[0]).toContain('🎉')
    })
  })

  describe('handleUserLogin', () => {
    it('应该处理用户登录事件', async () => {
      const event: ForumEvent = {
        type: 'user_login',
        data: {
          user: {
            username: 'testuser'
          },
          ip: '192.168.1.1',
          device: 'Chrome on Windows'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('用户登录')
      expect(callArgs[0]).toContain('testuser')
      expect(callArgs[0]).toContain('192.168.1.1')
    })
  })

  describe('handleUserUpdated', () => {
    it('应该处理用户更新事件', async () => {
      const event: ForumEvent = {
        type: 'user_updated',
        data: {
          user: {
            username: 'testuser'
          },
          changes: {
            bio: '新的个人简介'
          }
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('用户资料更新')
    })
  })

  describe('handleUserRoleChanged', () => {
    it('应该处理用户角色变更事件', async () => {
      const event: ForumEvent = {
        type: 'user_role_changed',
        data: {
          user: {
            username: 'testuser'
          },
          oldRole: 'user',
          newRole: 'moderator',
          changedBy: 'admin'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('用户角色变更')
      expect(callArgs[0]).toContain('普通用户')
      expect(callArgs[0]).toContain('管理员')
    })
  })

  describe('handleUserDeleted', () => {
    it('应该处理用户删除事件', async () => {
      const event: ForumEvent = {
        type: 'user_deleted',
        data: {
          user: {
            username: 'deleteduser',
            email: 'deleted@example.com'
          },
          deletedBy: 'admin'
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('用户删除')
      expect(callArgs[0]).toContain('deleteduser')
    })
  })
})

describe('NotificationEventHandler', () => {
  let handler: NotificationEventHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new NotificationEventHandler(mockClient as any)
  })

  describe('handleNotificationSent', () => {
    it('应该立即发送紧急通知', async () => {
      const event: ForumEvent = {
        type: 'notification_sent',
        data: {
          id: 'notif-1',
          recipient: 'user-1',
          title: '紧急通知',
          message: '这是一个紧急通知',
          type: 'error',
          priority: 'urgent',
          read: false,
          createdAt: Date.now()
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
    })

    it('应该批量处理普通通知', async () => {
      const event: ForumEvent = {
        type: 'notification_sent',
        data: {
          id: 'notif-1',
          recipient: 'user-1',
          title: '普通通知',
          message: '这是一个普通通知',
          type: 'info',
          priority: 'normal',
          read: false,
          createdAt: Date.now()
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      // 等待批量处理
      await new Promise(resolve => setTimeout(resolve, 100))

      // 普通通知应该在批量队列中
      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
    })
  })

  describe('handleNotificationBatch', () => {
    it('应该批量处理多个通知', async () => {
      const event: ForumEvent = {
        type: 'notification_batch',
        data: {
          notifications: [
            {
              id: 'notif-1',
              recipient: 'user-1',
              title: '通知1',
              message: '消息1',
              type: 'info',
              priority: 'normal',
              read: false,
              createdAt: Date.now()
            },
            {
              id: 'notif-2',
              recipient: 'user-1',
              title: '通知2',
              message: '消息2',
              type: 'success',
              priority: 'normal',
              read: false,
              createdAt: Date.now()
            }
          ]
        },
        timestamp: Date.now(),
        id: 'event-1'
      }

      await handler.handle(event)

      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
      const callArgs = mockClient.sendAgentMessage.mock.calls[0]
      expect(callArgs[0]).toContain('批量通知')
    })
  })

  describe('批量处理', () => {
    it('应该按类型分组批量发送通知', async () => {
      const notifications = [
        {
          id: 'notif-1',
          recipient: 'user-1',
          title: '信息通知1',
          message: '消息1',
          type: 'info' as const,
          priority: 'normal' as const,
          read: false,
          createdAt: Date.now()
        },
        {
          id: 'notif-2',
          recipient: 'user-1',
          title: '信息通知2',
          message: '消息2',
          type: 'info' as const,
          priority: 'normal' as const,
          read: false,
          createdAt: Date.now()
        },
        {
          id: 'notif-3',
          recipient: 'user-1',
          title: '成功通知',
          message: '消息3',
          type: 'success' as const,
          priority: 'normal' as const,
          read: false,
          createdAt: Date.now()
        }
      ]

      // 发送多个通知
      for (const notif of notifications) {
        const event: ForumEvent = {
          type: 'notification_sent',
          data: notif,
          timestamp: Date.now(),
          id: notif.id
        }
        await handler.handle(event)
      }

      // 等待批量处理
      await new Promise(resolve => setTimeout(resolve, 6000))

      // 应该至少发送一次批量通知
      expect(mockClient.sendAgentMessage).toHaveBeenCalled()
    })
  })
})