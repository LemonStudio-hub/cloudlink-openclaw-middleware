/**
 * 事件处理器
 * 处理各种论坛事件
 */

import type { Env, ForumEvent, EventHandler, OpenClawEvent } from '../../../types'
import { DataTransformer, ForumPost, ForumComment, ForumUser, ForumNotification } from '../transformer'
import { OpenClawClient } from '../client'
import { EventPriority } from '../router'

// 基础事件处理器
export abstract class BaseEventHandler implements EventHandler {
  protected client: OpenClawClient
  protected transformer: DataTransformer

  constructor(client: OpenClawClient) {
    this.client = client
    this.transformer = new DataTransformer()
  }

  abstract handle(event: ForumEvent): Promise<void>

  protected async sendToOpenClaw(message: string, sessionId?: string, thinking?: string): Promise<any> {
    return await this.client.sendAgentMessage(message, sessionId, thinking)
  }
}

// 帖子事件处理器
export class PostEventHandler extends BaseEventHandler {
  async handle(event: ForumEvent): Promise<void> {
    switch (event.type) {
      case 'post_created':
        await this.handlePostCreated(event)
        break
      case 'post_updated':
        await this.handlePostUpdated(event)
        break
      case 'post_deleted':
        await this.handlePostDeleted(event)
        break
      case 'post_approved':
      case 'post_rejected':
        await this.handlePostModeration(event)
        break
      default:
        console.warn(`Unknown post event type: ${event.type}`)
    }
  }

  private async handlePostCreated(event: ForumEvent): Promise<void> {
    const post = event.data as ForumPost
    
    // 验证数据
    const validation = DataTransformer.postToOpenClawMessage(post)
    
    const message = `📝 **新帖子创建**\n\n` +
                    `**标题**: ${post.title}\n` +
                    `**作者**: ${post.author.username}\n` +
                    `**分类**: ${post.category.name}\n` +
                    `**状态**: ${post.status}\n` +
                    `${post.tags.length > 0 ? `**标签**: ${post.tags.map(t => `#${t}`).join(' ')}\n` : ''}\n\n` +
                    `**内容预览**:\n${post.content.substring(0, 300)}...`
    
    await this.sendToOpenClaw(message, 'system', 'medium')
  }

  private async handlePostUpdated(event: ForumEvent): Promise<void> {
    const { post, changes } = event.data
    
    const changesText = Object.entries(changes)
      .map(([key, value]) => `  - ${key}: ${value}`)
      .join('\n')
    
    const message = `✏️ **帖子更新**\n\n` +
                    `**标题**: ${post.title}\n` +
                    `**作者**: ${post.author.username}\n\n` +
                    `**更改内容**:\n${changesText}`
    
    await this.sendToOpenClaw(message, 'system', 'low')
  }

  private async handlePostDeleted(event: ForumEvent): Promise<void> {
    const { post, deletedBy } = event.data
    
    const message = `🗑️ **帖子删除**\n\n` +
                    `**标题**: ${post.title}\n` +
                    `**作者**: ${post.author.username}\n` +
                    `**删除者**: ${deletedBy}\n` +
                    `**删除时间**: ${new Date(event.timestamp).toLocaleString('zh-CN')}`
    
    await this.sendToOpenClaw(message, 'system', 'high')
  }

  private async handlePostModeration(event: ForumEvent): Promise<void> {
    const { post, status, moderator, reason } = event.data
    
    const statusEmoji = status === 'approved' ? '✅' : '❌'
    const statusText = status === 'approved' ? '已批准' : '已拒绝'
    
    const message = `${statusEmoji} **帖子审核${statusText}**\n\n` +
                    `**标题**: ${post.title}\n` +
                    `**作者**: ${post.author.username}\n` +
                    `**审核员**: ${moderator}\n` +
                    `${reason ? `**原因**: ${reason}\n` : ''}`
    
    await this.sendToOpenClaw(message, 'system', 'high')
  }
}

// 评论事件处理器
export class CommentEventHandler extends BaseEventHandler {
  async handle(event: ForumEvent): Promise<void> {
    switch (event.type) {
      case 'comment_added':
        await this.handleCommentAdded(event)
        break
      case 'comment_updated':
        await this.handleCommentUpdated(event)
        break
      case 'comment_deleted':
        await this.handleCommentDeleted(event)
        break
      case 'comment_liked':
        await this.handleCommentLiked(event)
        break
      case 'comment_approved':
      case 'comment_rejected':
        await this.handleCommentModeration(event)
        break
      default:
        console.warn(`Unknown comment event type: ${event.type}`)
    }
  }

  private async handleCommentAdded(event: ForumEvent): Promise<void> {
    const { comment, post } = event.data
    
    const message = `💬 **新评论**\n\n` +
                    `**帖子**: ${post.title}\n` +
                    `**评论者**: ${comment.author.username}\n` +
                    `${comment.parentId ? '**回复评论**' : '**直接评论**'}\n\n` +
                    `**内容**:\n${comment.content.substring(0, 300)}...`
    
    await this.sendToOpenClaw(message, 'system', 'medium')
  }

  private async handleCommentUpdated(event: ForumEvent): Promise<void> {
    const { comment, post, changes } = event.data
    
    const changesText = Object.entries(changes)
      .map(([key, value]) => `  - ${key}: ${value}`)
      .join('\n')
    
    const message = `✏️ **评论更新**\n\n` +
                    `**帖子**: ${post.title}\n` +
                    `**评论者**: ${comment.author.username}\n\n` +
                    `**更改内容**:\n${changesText}`
    
    await this.sendToOpenClaw(message, 'system', 'low')
  }

  private async handleCommentDeleted(event: ForumEvent): Promise<void> {
    const { comment, post, deletedBy } = event.data
    
    const message = `🗑️ **评论删除**\n\n` +
                    `**帖子**: ${post.title}\n` +
                    `**评论者**: ${comment.author.username}\n` +
                    `**删除者**: ${deletedBy}\n` +
                    `**删除时间**: ${new Date(event.timestamp).toLocaleString('zh-CN')}`
    
    await this.sendToOpenClaw(message, 'system', 'normal')
  }

  private async handleCommentLiked(event: ForumEvent): Promise<void> {
    const { comment, post, likedBy, likeCount } = event.data
    
    const message = `❤️ **评论点赞**\n\n` +
                    `**帖子**: ${post.title}\n` +
                    `**评论者**: ${comment.author.username}\n` +
                    `**点赞者**: ${likedBy}\n` +
                    `**当前点赞数**: ${likeCount}`
    
    await this.sendToOpenClaw(message, 'system', 'low')
  }

  private async handleCommentModeration(event: ForumEvent): Promise<void> {
    const { comment, post, status, moderator, reason } = event.data
    
    const statusEmoji = status === 'approved' ? '✅' : '❌'
    const statusText = status === 'approved' ? '已批准' : '已拒绝'
    
    const message = `${statusEmoji} **评论审核${statusText}**\n\n` +
                    `**帖子**: ${post.title}\n` +
                    `**评论者**: ${comment.author.username}\n` +
                    `**审核员**: ${moderator}\n` +
                    `${reason ? `**原因**: ${reason}\n` : ''}`
    
    await this.sendToOpenClaw(message, 'system', 'high')
  }
}

// 用户事件处理器
export class UserEventHandler extends BaseEventHandler {
  async handle(event: ForumEvent): Promise<void> {
    switch (event.type) {
      case 'user_registered':
        await this.handleUserRegistered(event)
        break
      case 'user_login':
        await this.handleUserLogin(event)
        break
      case 'user_updated':
        await this.handleUserUpdated(event)
        break
      case 'user_role_changed':
        await this.handleUserRoleChanged(event)
        break
      case 'user_deleted':
        await this.handleUserDeleted(event)
        break
      default:
        console.warn(`Unknown user event type: ${event.type}`)
    }
  }

  private async handleUserRegistered(event: ForumEvent): Promise<void> {
    const user = event.data as ForumUser
    
    const message = `👤 **新用户注册**\n\n` +
                    `**用户名**: ${user.username}\n` +
                    `**邮箱**: ${user.email}\n` +
                    `${user.bio ? `**简介**: ${user.bio.substring(0, 100)}...\n` : ''}\n` +
                    `**角色**: ${this.formatUserRole(user.role)}\n\n` +
                    `🎉 欢迎加入云纽论坛！`
    
    await this.sendToOpenClaw(message, 'system', 'medium')
  }

  private async handleUserLogin(event: ForumEvent): Promise<void> {
    const { user, ip, device } = event.data
    
    const message = `🔐 **用户登录**\n\n` +
                    `**用户**: ${user.username}\n` +
                    `**IP地址**: ${ip}\n` +
                    `${device ? `**设备**: ${device}\n` : ''}` +
                    `**登录时间**: ${new Date(event.timestamp).toLocaleString('zh-CN')}`
    
    await this.sendToOpenClaw(message, 'system', 'low')
  }

  private async handleUserUpdated(event: ForumEvent): Promise<void> {
    const { user, changes } = event.data
    
    const changesText = Object.entries(changes)
      .map(([key, value]) => `  - ${key}: ${value}`)
      .join('\n')
    
    const message = `👤 **用户资料更新**\n\n` +
                    `**用户**: ${user.username}\n\n` +
                    `**更改内容**:\n${changesText}`
    
    await this.sendToOpenClaw(message, 'system', 'low')
  }

  private async handleUserRoleChanged(event: ForumEvent): Promise<void> {
    const { user, oldRole, newRole, changedBy } = event.data
    
    const message = `🔑 **用户角色变更**\n\n` +
                    `**用户**: ${user.username}\n` +
                    `**原角色**: ${this.formatUserRole(oldRole)}\n` +
                    `**新角色**: ${this.formatUserRole(newRole)}\n` +
                    `**操作者**: ${changedBy}`
    
    await this.sendToOpenClaw(message, 'system', 'high')
  }

  private async handleUserDeleted(event: ForumEvent): Promise<void> {
    const { user, deletedBy } = event.data
    
    const message = `🗑️ **用户删除**\n\n` +
                    `**用户名**: ${user.username}\n` +
                    `**邮箱**: ${user.email}\n` +
                    `**删除者**: ${deletedBy}\n` +
                    `**删除时间**: ${new Date(event.timestamp).toLocaleString('zh-CN')}`
    
    await this.sendToOpenClaw(message, 'system', 'high')
  }

  private formatUserRole(role: string): string {
    const roleMap: Record<string, string> = {
      'user': '普通用户',
      'moderator': '管理员',
      'admin': '超级管理员'
    }
    return roleMap[role] || role
  }
}

// 通知事件处理器
export class NotificationEventHandler extends BaseEventHandler {
  private notificationQueue: Map<string, ForumNotification[]> = new Map()
  private batchTimeouts: Map<string, number> = new Map()

  async handle(event: ForumEvent): Promise<void> {
    switch (event.type) {
      case 'notification_sent':
        await this.handleNotificationSent(event)
        break
      case 'notification_batch':
        await this.handleNotificationBatch(event)
        break
      default:
        console.warn(`Unknown notification event type: ${event.type}`)
    }
  }

  private async handleNotificationSent(event: ForumEvent): Promise<void> {
    const notification = event.data as ForumNotification
    
    // 根据优先级决定是否批量处理
    if (notification.priority === 'urgent' || notification.priority === 'high') {
      // 紧急或高优先级通知立即发送
      await this.sendNotification(notification)
    } else {
      // 普通和低优先级通知加入批量队列
      this.addToBatchQueue(notification)
    }
  }

  private async handleNotificationBatch(event: ForumEvent): Promise<void> {
    const notifications = event.data.notifications as ForumNotification[]
    
    // 批量发送通知
    const message = this.formatBatchNotification(notifications)
    
    await this.sendToOpenClaw(message, 'system', 'low')
  }

  private addToBatchQueue(notification: ForumNotification): void {
    const recipient = notification.recipient
    
    if (!this.notificationQueue.has(recipient)) {
      this.notificationQueue.set(recipient, [])
    }
    
    this.notificationQueue.get(recipient)!.push(notification)
    
    // 设置批量发送定时器
    if (!this.batchTimeouts.has(recipient)) {
      const timeout = setTimeout(() => {
        this.flushBatchQueue(recipient)
      }, 5000) as unknown as number // 5秒后批量发送
      
      this.batchTimeouts.set(recipient, timeout)
    }
  }

  private async flushBatchQueue(recipient: string): Promise<void> {
    const notifications = this.notificationQueue.get(recipient)
    
    if (!notifications || notifications.length === 0) {
      return
    }
    
    // 清除定时器
    if (this.batchTimeouts.has(recipient)) {
      clearTimeout(this.batchTimeouts.get(recipient)!)
      this.batchTimeouts.delete(recipient)
    }
    
    // 清空队列
    this.notificationQueue.delete(recipient)
    
    // 批量发送
    const message = this.formatBatchNotification(notifications)
    await this.sendToOpenClaw(message, 'system', 'low')
  }

  private formatBatchNotification(notifications: ForumNotification[]): string {
    const groupedByType = new Map<string, ForumNotification[]>()
    
    // 按类型分组
    for (const notification of notifications) {
      if (!groupedByType.has(notification.type)) {
        groupedByType.set(notification.type, [])
      }
      groupedByType.get(notification.type)!.push(notification)
    }
    
    let message = '📬 **批量通知**\n\n'
    
    // 按优先级排序
    const priorityOrder = ['urgent', 'high', 'normal', 'low']
    const sortedTypes = Array.from(groupedByType.keys()).sort((a, b) => {
      const priorityA = groupedByType.get(a)![0].priority
      const priorityB = groupedByType.get(b)![0].priority
      return priorityOrder.indexOf(priorityA) - priorityOrder.indexOf(priorityB)
    })
    
    // 格式化每种类型的通知
    for (const type of sortedTypes) {
      const typeNotifications = groupedByType.get(type)!
      const typeEmoji = this.getTypeEmoji(type)
      
      message += `${typeEmoji} **${this.getTypeLabel(type)}** (${typeNotifications.length})\n\n`
      
      for (const notification of typeNotifications.slice(0, 3)) { // 最多显示3条
        message += `  - ${notification.title}\n`
      }
      
      if (typeNotifications.length > 3) {
        message += `  - 还有 ${typeNotifications.length - 3} 条通知...\n`
      }
      
      message += '\n'
    }
    
    return message
  }

  private async sendNotification(notification: ForumNotification): Promise<void> {
    const message = DataTransformer.notificationToOpenClawMessage(notification)
    
    await this.sendToOpenClaw(
      message.content,
      'notification',
      notification.priority === 'urgent' ? 'high' : 'low'
    )
  }

  private getTypeEmoji(type: string): string {
    const emojiMap: Record<string, string> = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌'
    }
    return emojiMap[type] || '📢'
  }

  private getTypeLabel(type: string): string {
    const labelMap: Record<string, string> = {
      'info': '信息',
      'success': '成功',
      'warning': '警告',
      'error': '错误'
    }
    return labelMap[type] || type
  }
}

// 事件处理器工厂
export class EventHandlerFactory {
  static createHandler(eventType: string, client: OpenClawClient): EventHandler | null {
    if (eventType.startsWith('post_')) {
      return new PostEventHandler(client)
    }
    
    if (eventType.startsWith('comment_')) {
      return new CommentEventHandler(client)
    }
    
    if (eventType.startsWith('user_')) {
      return new UserEventHandler(client)
    }
    
    if (eventType.startsWith('notification_')) {
      return new NotificationEventHandler(client)
    }
    
    return null
  }
}