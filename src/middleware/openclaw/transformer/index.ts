/**
 * 数据转换器
 * 负责在 OpenClaw 格式和论坛格式之间进行转换
 */

import type { ForumEvent, OpenClawEvent } from '../../../types'

// 论坛数据格式
export interface ForumPost {
  id: string
  title: string
  content: string
  author: {
    id: string
    username: string
    avatar?: string
  }
  category: {
    id: string
    name: string
  }
  tags: string[]
  createdAt: number
  updatedAt: number
  status: 'draft' | 'published' | 'archived'
}

export interface ForumComment {
  id: string
  postId: string
  content: string
  author: {
    id: string
    username: string
    avatar?: string
  }
  parentId?: string
  createdAt: number
  updatedAt: number
  status: 'pending' | 'approved' | 'rejected'
}

export interface ForumUser {
  id: string
  username: string
  email: string
  avatar?: string
  bio?: string
  createdAt: number
  updatedAt: number
  role: 'user' | 'moderator' | 'admin'
}

export interface ForumNotification {
  id: string
  recipient: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  read: boolean
  createdAt: number
}

// OpenClaw 消息格式
export interface OpenClawMessageFormat {
  type: 'text' | 'markdown' | 'json'
  content: string
  metadata?: {
    mentions?: string[]
    emojis?: string[]
    attachments?: string[]
  }
}

// Schema 验证器
export class SchemaValidator {
  private static readonly POST_SCHEMA = {
    required: ['id', 'title', 'content', 'author', 'category'],
    optional: ['tags', 'createdAt', 'updatedAt', 'status']
  }

  private static readonly COMMENT_SCHEMA = {
    required: ['id', 'postId', 'content', 'author'],
    optional: ['parentId', 'createdAt', 'updatedAt', 'status']
  }

  private static readonly USER_SCHEMA = {
    required: ['id', 'username', 'email'],
    optional: ['avatar', 'bio', 'createdAt', 'updatedAt', 'role']
  }

  static validatePost(data: any): { valid: boolean; errors?: string[] } {
    return this.validate(data, this.POST_SCHEMA)
  }

  static validateComment(data: any): { valid: boolean; errors?: string[] } {
    return this.validate(data, this.COMMENT_SCHEMA)
  }

  static validateUser(data: any): { valid: boolean; errors?: string[] } {
    return this.validate(data, this.USER_SCHEMA)
  }

  private static validate(data: any, schema: { required: string[]; optional: string[] }): { valid: boolean; errors?: string[] } {
    const errors: string[] = []

    for (const field of schema.required) {
      if (data[field] === undefined || data[field] === null) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  static validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number' && !isNaN(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'array':
        return Array.isArray(value)
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      default:
        return false
    }
  }
}

// 数据转换器
export class DataTransformer {
  /**
   * 将论坛帖子转换为 OpenClaw 消息格式
   */
  static postToOpenClawMessage(post: ForumPost): OpenClawMessageFormat {
    const tagsText = post.tags.length > 0 ? post.tags.map(t => `#${t}`).join(' ') : ''
    
    return {
      type: 'markdown',
      content: `# ${post.title}\n\n` +
               `**作者**: ${post.author.username}\n` +
               `**分类**: ${post.category.name}\n` +
               `${tagsText ? `**标签**: ${tagsText}\n` : ''}\n\n` +
               `${post.content}`,
      metadata: {
        mentions: this.extractMentions(post.content),
        emojis: this.extractEmojis(post.content)
      }
    }
  }

  /**
   * 将论坛评论转换为 OpenClaw 消息格式
   */
  static commentToOpenClawMessage(comment: ForumComment, postTitle: string): OpenClawMessageFormat {
    return {
      type: 'markdown',
      content: `**Re: ${postTitle}**\n\n` +
               `**评论者**: ${comment.author.username}\n\n` +
               `${comment.content}`,
      metadata: {
        mentions: this.extractMentions(comment.content),
        emojis: this.extractEmojis(comment.content)
      }
    }
  }

  /**
   * 将论坛用户转换为 OpenClaw 消息格式
   */
  static userToOpenClawMessage(user: ForumUser): OpenClawMessageFormat {
    return {
      type: 'markdown',
      content: `**用户信息**\n\n` +
               `**用户名**: ${user.username}\n` +
               `**邮箱**: ${user.email}\n` +
               `**角色**: ${this.formatUserRole(user.role)}\n` +
               `${user.bio ? `**简介**: ${user.bio}\n` : ''}`
    }
  }

  /**
   * 将论坛通知转换为 OpenClaw 消息格式
   */
  static notificationToOpenClawMessage(notification: ForumNotification): OpenClawMessageFormat {
    const priorityEmoji = this.getPriorityEmoji(notification.priority)
    const typeEmoji = this.getTypeEmoji(notification.type)
    
    return {
      type: 'markdown',
      content: `${priorityEmoji} ${typeEmoji} **${notification.title}**\n\n` +
               `${notification.message}\n\n` +
               `*优先级: ${notification.priority}*`
    }
  }

  /**
   * 将 OpenClaw 消息转换为论坛事件
   */
  static openClawMessageToForumEvent(
    message: OpenClawMessageFormat,
    eventType: string,
    additionalData?: any
  ): ForumEvent {
    return {
      type: eventType as any,
      data: {
        message: message.content,
        metadata: message.metadata,
        ...additionalData
      },
      timestamp: Date.now(),
      id: this.generateEventId()
    }
  }

  /**
   * 提取文本中的提及（@username）
   */
  private static extractMentions(text: string): string[] {
    const mentions = text.match(/@(\w+)/g) || []
    return mentions.map(m => m.substring(1))
  }

  /**
   * 提取文本中的表情符号
   */
  private static extractEmojis(text: string): string[] {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
    return text.match(emojiRegex) || []
  }

  /**
   * 格式化用户角色
   */
  private static formatUserRole(role: string): string {
    const roleMap: Record<string, string> = {
      'user': '普通用户',
      'moderator': '管理员',
      'admin': '超级管理员'
    }
    return roleMap[role] || role
  }

  /**
   * 获取优先级对应的表情符号
   */
  private static getPriorityEmoji(priority: string): string {
    const emojiMap: Record<string, string> = {
      'low': '💚',
      'normal': '💙',
      'high': '🧡',
      'urgent': '❤️'
    }
    return emojiMap[priority] || '⚪'
  }

  /**
   * 获取通知类型对应的表情符号
   */
  private static getTypeEmoji(type: string): string {
    const emojiMap: Record<string, string> = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌'
    }
    return emojiMap[type] || '📢'
  }

  /**
   * 生成事件 ID
   */
  private static generateEventId(): string {
    return `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}

// 协议适配器
export class ProtocolAdapter {
  private static readonly CURRENT_VERSION = '1.0.0'
  private static readonly SUPPORTED_VERSIONS = ['1.0.0', '0.9.0']

  static adaptToVersion(data: any, targetVersion: string): any {
    if (targetVersion === this.CURRENT_VERSION) {
      return data
    }

    // 版本兼容性处理
    switch (targetVersion) {
      case '0.9.0':
        return this.downgradeToV090(data)
      default:
        throw new Error(`Unsupported protocol version: ${targetVersion}`)
    }
  }

  static isVersionSupported(version: string): boolean {
    return this.SUPPORTED_VERSIONS.includes(version)
  }

  private static downgradeToV090(data: any): any {
    // 简化的版本降级逻辑
    const result = { ...data }
    
    // 移除 v1.0.0 新增的字段
    if (result.metadata) {
      delete result.metadata.mentions
      delete result.metadata.emojis
    }
    
    return result
  }

  static adaptError(error: any): { code: string; message: string; details?: any } {
    // 将各种错误类型转换为统一的错误格式
    if (error instanceof Error) {
      return {
        code: 'INTERNAL_ERROR',
        message: error.message,
        details: {
          name: error.name,
          stack: error.stack
        }
      }
    }

    if (typeof error === 'object' && error !== null) {
      return {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An unknown error occurred',
        details: error.details
      }
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: String(error)
    }
  }
}

// 导出所有类型和类
export {
  DataTransformer,
  SchemaValidator,
  ProtocolAdapter
}
