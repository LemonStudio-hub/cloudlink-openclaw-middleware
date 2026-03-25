/**
 * OpenClaw 工具集
 * 提供丰富的 AI 助手工具
 */

import type { Env, OpenClawTool } from '../../../types'
import { DataTransformer, ForumPost, ForumComment, ForumUser } from '../transformer'
import { OpenClawClient } from '../client'

// 搜索参数
interface SearchParams {
  query: string
  type?: 'posts' | 'users' | 'comments' | 'tags' | 'all'
  limit?: number
  offset?: number
  filters?: Record<string, any>
}

// 创建参数
interface CreatePostParams {
  title: string
  content: string
  categoryId: string
  tags?: string[]
  authorId: string
}

interface CreateCommentParams {
  postId: string
  content: string
  authorId: string
  parentId?: string
}

// 统计参数
interface StatsParams {
  type: 'users' | 'posts' | 'comments' | 'activity' | 'trends'
  period?: 'day' | 'week' | 'month' | 'year' | 'all'
  startDate?: number
  endDate?: number
}

// 管理参数
interface ManagementParams {
  action: 'approve' | 'reject' | 'delete' | 'ban' | 'unban' | 'update_role'
  targetType: 'post' | 'comment' | 'user'
  targetId: string
  reason?: string
  roleId?: string
}

// 工具基类
export abstract class BaseTool implements OpenClawTool {
  name: string
  description: string
  parameters: any
  protected env: Env
  protected client: OpenClawClient

  constructor(env: Env, client: OpenClawClient) {
    this.env = env
    this.client = client
  }

  abstract handler(params: any, env: Env): Promise<any>
}

// 搜索工具
export class SearchTool extends BaseTool {
  constructor(env: Env, client: OpenClawClient) {
    super(env, client)
    this.name = 'search'
    this.description = '搜索论坛内容，包括帖子、用户、评论和标签'
    this.parameters = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词'
        },
        type: {
          type: 'string',
          enum: ['posts', 'users', 'comments', 'tags', 'all'],
          description: '搜索类型，默认为 all'
        },
        limit: {
          type: 'number',
          description: '返回结果数量，默认为 10'
        },
        offset: {
          type: 'number',
          description: '偏移量，用于分页'
        },
        filters: {
          type: 'object',
          description: '额外的过滤条件'
        }
      },
      required: ['query']
    }
  }

  async handler(params: SearchParams, env: Env): Promise<any> {
    const { query, type = 'all', limit = 10, offset = 0, filters = {} } = params

    let results: any[] = []
    let total = 0

    switch (type) {
      case 'posts':
        ({ results, total } = await this.searchPosts(query, limit, offset, filters))
        break
      case 'users':
        ({ results, total } = await this.searchUsers(query, limit, offset, filters))
        break
      case 'comments':
        ({ results, total } = await this.searchComments(query, limit, offset, filters))
        break
      case 'tags':
        ({ results, total } = await this.searchTags(query, limit, offset))
        break
      case 'all':
      default:
        const posts = await this.searchPosts(query, Math.ceil(limit / 3), offset, filters)
        const users = await this.searchUsers(query, Math.ceil(limit / 3), offset, filters)
        const comments = await this.searchComments(query, Math.ceil(limit / 3), offset, filters)
        
        results = [
          ...posts.results.map((r: any) => ({ ...r, type: 'post' })),
          ...users.results.map((r: any) => ({ ...r, type: 'user' })),
          ...comments.results.map((r: any) => ({ ...r, type: 'comment' }))
        ]
        total = posts.total + users.total + comments.total
    }

    return {
      results,
      total,
      query,
      type,
      limit,
      offset
    }
  }

  private async searchPosts(query: string, limit: number, offset: number, filters: Record<string, any>): Promise<{ results: any[]; total: number }> {
    const results = await env.DB.prepare(`
      SELECT 
        p.*,
        u.username as author_name,
        c.name as category_name
      FROM posts p
      JOIN users u ON p.author_id = u.id
      JOIN categories c ON p.category_id = c.id
      WHERE 
        (p.title LIKE ? OR p.content LIKE ?)
        ${filters.categoryId ? 'AND p.category_id = ?' : ''}
        ${filters.authorId ? 'AND p.author_id = ?' : ''}
        ${filters.status ? 'AND p.status = ?' : ''}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(
      `%${query}%`,
      `%${query}%`,
      ...(filters.categoryId ? [filters.categoryId] : []),
      ...(filters.authorId ? [filters.authorId] : []),
      ...(filters.status ? [filters.status] : []),
      limit,
      offset
    ).all()

    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM posts p
      WHERE 
        (p.title LIKE ? OR p.content LIKE ?)
        ${filters.categoryId ? 'AND p.category_id = ?' : ''}
        ${filters.authorId ? 'AND p.author_id = ?' : ''}
        ${filters.status ? 'AND p.status = ?' : ''}
    `).bind(
      `%${query}%`,
      `%${query}%`,
      ...(filters.categoryId ? [filters.categoryId] : []),
      ...(filters.authorId ? [filters.authorId] : []),
      ...(filters.status ? [filters.status] : [])
    ).first() as any

    return {
      results: results.results || [],
      total: countResult.count
    }
  }

  private async searchUsers(query: string, limit: number, offset: number, filters: Record<string, any>): Promise<{ results: any[]; total: number }> {
    const results = await env.DB.prepare(`
      SELECT id, username, email, avatar, bio, role, created_at
      FROM users
      WHERE 
        (username LIKE ? OR email LIKE ?)
        ${filters.role ? 'AND role = ?' : ''}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(
      `%${query}%`,
      `%${query}%`,
      ...(filters.role ? [filters.role] : []),
      limit,
      offset
    ).all()

    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM users
      WHERE 
        (username LIKE ? OR email LIKE ?)
        ${filters.role ? 'AND role = ?' : ''}
    `).bind(
      `%${query}%`,
      `%${query}%`,
      ...(filters.role ? [filters.role] : [])
    ).first() as any

    return {
      results: results.results || [],
      total: countResult.count
    }
  }

  private async searchComments(query: string, limit: number, offset: number, filters: Record<string, any>): Promise<{ results: any[]; total: number }> {
    const results = await env.DB.prepare(`
      SELECT 
        c.*,
        u.username as author_name,
        p.title as post_title
      FROM comments c
      JOIN users u ON c.author_id = u.id
      JOIN posts p ON c.post_id = p.id
      WHERE 
        c.content LIKE ?
        ${filters.postId ? 'AND c.post_id = ?' : ''}
        ${filters.authorId ? 'AND c.author_id = ?' : ''}
        ${filters.status ? 'AND c.status = ?' : ''}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(
      `%${query}%`,
      ...(filters.postId ? [filters.postId] : []),
      ...(filters.authorId ? [filters.authorId] : []),
      ...(filters.status ? [filters.status] : []),
      limit,
      offset
    ).all()

    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM comments c
      WHERE 
        c.content LIKE ?
        ${filters.postId ? 'AND c.post_id = ?' : ''}
        ${filters.authorId ? 'AND c.author_id = ?' : ''}
        ${filters.status ? 'AND c.status = ?' : ''}
    `).bind(
      `%${query}%`,
      ...(filters.postId ? [filters.postId] : []),
      ...(filters.authorId ? [filters.authorId] : []),
      ...(filters.status ? [filters.status] : [])
    ).first() as any

    return {
      results: results.results || [],
      total: countResult.count
    }
  }

  private async searchTags(query: string, limit: number, offset: number): Promise<{ results: any[]; total: number }> {
    const results = await env.DB.prepare(`
      SELECT t.*, COUNT(pt.post_id) as post_count
      FROM tags t
      LEFT JOIN post_tags pt ON t.id = pt.tag_id
      WHERE t.name LIKE ?
      GROUP BY t.id
      ORDER BY post_count DESC
      LIMIT ? OFFSET ?
    `).bind(
      `%${query}%`,
      limit,
      offset
    ).all()

    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM tags
      WHERE name LIKE ?
    `).bind(
      `%${query}%`
    ).first() as any

    return {
      results: results.results || [],
      total: countResult.count
    }
  }
}

// 创建工具
export class CreateTool extends BaseTool {
  constructor(env: Env, client: OpenClawClient) {
    super(env, client)
    this.name = 'create'
    this.description = '创建新的论坛内容，包括帖子、评论、分类和标签'
    this.parameters = {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['post', 'comment', 'category', 'tag'],
          description: '创建内容类型'
        },
        data: {
          type: 'object',
          description: '创建内容的数据'
        }
      },
      required: ['type', 'data']
    }
  }

  async handler(params: { type: string; data: any }, env: Env): Promise<any> {
    const { type, data } = params

    let result: any

    switch (type) {
      case 'post':
        result = await this.createPost(data, env)
        break
      case 'comment':
        result = await this.createComment(data, env)
        break
      case 'category':
        result = await this.createCategory(data, env)
        break
      case 'tag':
        result = await this.createTag(data, env)
        break
      default:
        throw new Error(`Unsupported create type: ${type}`)
    }

    return {
      success: true,
      type,
      result
    }
  }

  private async createPost(params: CreatePostParams, env: Env): Promise<any> {
    const { title, content, categoryId, tags = [], authorId } = params

    // 验证分类是否存在
    const category = await env.DB.prepare(
      'SELECT * FROM categories WHERE id = ?'
    ).bind(categoryId).first()

    if (!category) {
      throw new Error('Category not found')
    }

    // 创建帖子
    const postId = `post-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const now = Date.now()

    await env.DB.prepare(`
      INSERT INTO posts (id, title, content, author_id, category_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'published', ?, ?)
    `).bind(
      postId,
      title,
      content,
      authorId,
      now,
      now
    ).run()

    // 添加标签
    if (tags.length > 0) {
      for (const tagName of tags) {
        // 获取或创建标签
        let tag = await env.DB.prepare(
          'SELECT * FROM tags WHERE name = ?'
        ).bind(tagName).first()

        if (!tag) {
          const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
          await env.DB.prepare(
            'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)'
          ).bind(tagId, tagName, now).run()
          tag = { id: tagId }
        }

        // 关联标签
        await env.DB.prepare(
          'INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)'
        ).bind(postId, tag.id).run()
      }
    }

    return { id: postId, title, status: 'published' }
  }

  private async createComment(params: CreateCommentParams, env: Env): Promise<any> {
    const { postId, content, authorId, parentId } = params

    // 验证帖子是否存在
    const post = await env.DB.prepare(
      'SELECT * FROM posts WHERE id = ?'
    ).bind(postId).first()

    if (!post) {
      throw new Error('Post not found')
    }

    // 创建评论
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const now = Date.now()

    await env.DB.prepare(`
      INSERT INTO comments (id, post_id, content, author_id, parent_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(
      commentId,
      postId,
      content,
      authorId,
      parentId || null,
      now,
      now
    ).run()

    return { id: commentId, postId, status: 'pending' }
  }

  private async createCategory(data: { name: string; description?: string }, env: Env): Promise<any> {
    const { name, description } = data

    const categoryId = `category-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const now = Date.now()

    await env.DB.prepare(`
      INSERT INTO categories (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      categoryId,
      name,
      description || '',
      now,
      now
    ).run()

    return { id: categoryId, name }
  }

  private async createTag(data: { name: string; description?: string }, env: Env): Promise<any> {
    const { name, description } = data

    // 检查标签是否已存在
    const existing = await env.DB.prepare(
      'SELECT * FROM tags WHERE name = ?'
    ).bind(name).first()

    if (existing) {
      return { id: existing.id, name, exists: true }
    }

    const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const now = Date.now()

    await env.DB.prepare(`
      INSERT INTO tags (id, name, description, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      tagId,
      name,
      description || '',
      now
    ).run()

    return { id: tagId, name, exists: false }
  }
}

// 统计工具
export class StatsTool extends BaseTool {
  constructor(env: Env, client: OpenClawClient) {
    super(env, client)
    this.name = 'stats'
    this.description = '获取论坛统计数据，包括用户、帖子、评论、活动和趋势分析'
    this.parameters = {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['users', 'posts', 'comments', 'activity', 'trends'],
          description: '统计类型'
        },
        period: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year', 'all'],
          description: '统计周期，默认为 all'
        },
        startDate: {
          type: 'number',
          description: '开始时间戳'
        },
        endDate: {
          type: 'number',
          description: '结束时间戳'
        }
      },
      required: ['type']
    }
  }

  async handler(params: StatsParams, env: Env): Promise<any> {
    const { type, period = 'all', startDate, endDate } = params

    let result: any

    switch (type) {
      case 'users':
        result = await this.getUserStats(period, startDate, endDate, env)
        break
      case 'posts':
        result = await this.getPostStats(period, startDate, endDate, env)
        break
      case 'comments':
        result = await this.getCommentStats(period, startDate, endDate, env)
        break
      case 'activity':
        result = await this.getActivityStats(period, startDate, endDate, env)
        break
      case 'trends':
        result = await this.getTrendStats(period, startDate, endDate, env)
        break
      default:
        throw new Error(`Unsupported stats type: ${type}`)
    }

    return {
      type,
      period,
      result
    }
  }

  private async getUserStats(period: string, startDate: number | undefined, endDate: number | undefined, env: Env): Promise<any> {
    const now = Date.now()
    const timeRange = this.getTimeRange(period, startDate, endDate, now)

    const result = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as new_users,
        COUNT(CASE WHEN role = 'user' THEN 1 END) as regular_users,
        COUNT(CASE WHEN role = 'moderator' THEN 1 END) as moderators,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins
      FROM users
      WHERE created_at >= ? AND created_at <= ?
    `).bind(timeRange.start, timeRange.start, timeRange.end).first() as any

    return {
      total: result.total,
      newUsers: result.new_users,
      regularUsers: result.regular_users,
      moderators: result.moderators,
      admins: result.admins
    }
  }

  private async getPostStats(period: string, startDate: number | undefined, endDate: number | undefined, env: Env): Promise<any> {
    const now = Date.now()
    const timeRange = this.getTimeRange(period, startDate, endDate, now)

    const result = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as new_posts,
        COUNT(CASE WHEN status = 'published' THEN 1 END) as published,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as drafts,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived,
        AVG(LENGTH(content)) as avg_content_length
      FROM posts
      WHERE created_at >= ? AND created_at <= ?
    `).bind(timeRange.start, timeRange.start, timeRange.end).first() as any

    return {
      total: result.total,
      newPosts: result.new_posts,
      published: result.published,
      drafts: result.drafts,
      archived: result.archived,
      avgContentLength: Math.round(result.avg_content_length || 0)
    }
  }

  private async getCommentStats(period: string, startDate: number | undefined, endDate: number | undefined, env: Env): Promise<any> {
    const now = Date.now()
    const timeRange = this.getTimeRange(period, startDate, endDate, now)

    const result = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as new_comments,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        AVG(LENGTH(content)) as avg_content_length
      FROM comments
      WHERE created_at >= ? AND created_at <= ?
    `).bind(timeRange.start, timeRange.start, timeRange.end).first() as any

    return {
      total: result.total,
      newComments: result.new_comments,
      approved: result.approved,
      pending: result.pending,
      rejected: result.rejected,
      avgContentLength: Math.round(result.avg_content_length || 0)
    }
  }

  private async getActivityStats(period: string, startDate: number | undefined, endDate: number | undefined, env: Env): Promise<any> {
    const now = Date.now()
    const timeRange = this.getTimeRange(period, startDate, endDate, now)

    const posts = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM posts WHERE created_at >= ? AND created_at <= ?'
    ).bind(timeRange.start, timeRange.end).first() as any

    const comments = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM comments WHERE created_at >= ? AND created_at <= ?'
    ).bind(timeRange.start, timeRange.end).first() as any

    const users = await env.DB.prepare(
      'SELECT COUNT(DISTINCT author_id) as count FROM posts WHERE created_at >= ? AND created_at <= ?'
    ).bind(timeRange.start, timeRange.end).first() as any

    return {
      newPosts: posts.count,
      newComments: comments.count,
      activeUsers: users.count,
      totalActivity: posts.count + comments.count
    }
  }

  private async getTrendStats(period: string, startDate: number | undefined, endDate: number | undefined, env: Env): Promise<any> {
    const now = Date.now()
    const timeRange = this.getTimeRange(period, startDate, endDate, now)

    // 按天统计
    const dailyStats = await env.DB.prepare(`
      SELECT 
        DATE(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as posts
      FROM posts
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `).bind(timeRange.start, timeRange.end).all()

    // 热门标签
    const popularTags = await env.DB.prepare(`
      SELECT 
        t.name,
        COUNT(pt.post_id) as count
      FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      JOIN posts p ON pt.post_id = p.id
      WHERE p.created_at >= ? AND p.created_at <= ?
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 10
    `).bind(timeRange.start, timeRange.end).all()

    // 活跃用户
    const activeUsers = await env.DB.prepare(`
      SELECT 
        u.username,
        COUNT(p.id) as post_count,
        COUNT(c.id) as comment_count
      FROM users u
      LEFT JOIN posts p ON u.id = p.author_id AND p.created_at >= ? AND p.created_at <= ?
      LEFT JOIN comments c ON u.id = c.author_id AND c.created_at >= ? AND c.created_at <= ?
      GROUP BY u.id
      HAVING post_count > 0 OR comment_count > 0
      ORDER BY (post_count + comment_count) DESC
      LIMIT 10
    `).bind(timeRange.start, timeRange.end, timeRange.start, timeRange.end).all()

    return {
      dailyPosts: dailyStats.results || [],
      popularTags: popularTags.results || [],
      activeUsers: activeUsers.results || []
    }
  }

  private getTimeRange(period: string, startDate: number | undefined, endDate: number | undefined, now: number): { start: number; end: number } {
    let start: number
    let end: number = endDate || now

    if (startDate) {
      start = startDate
    } else {
      switch (period) {
        case 'day':
          start = now - 24 * 60 * 60 * 1000
          break
        case 'week':
          start = now - 7 * 24 * 60 * 60 * 1000
          break
        case 'month':
          start = now - 30 * 24 * 60 * 60 * 1000
          break
        case 'year':
          start = now - 365 * 24 * 60 * 60 * 1000
          break
        case 'all':
        default:
          start = 0
      }
    }

    return { start, end }
  }
}

// 管理工具
export class ManagementTool extends BaseTool {
  constructor(env: Env, client: OpenClawClient) {
    super(env, client)
    this.name = 'manage'
    this.description = '管理论坛内容，包括审核、删除、封禁和角色管理'
    this.parameters = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['approve', 'reject', 'delete', 'ban', 'unban', 'update_role'],
          description: '管理操作类型'
        },
        targetType: {
          type: 'string',
          enum: ['post', 'comment', 'user'],
          description: '目标类型'
        },
        targetId: {
          type: 'string',
          description: '目标 ID'
        },
        reason: {
          type: 'string',
          description: '操作原因'
        },
        roleId: {
          type: 'string',
          description: '新角色 ID（仅用于 update_role 操作）'
        }
      },
      required: ['action', 'targetType', 'targetId']
    }
  }

  async handler(params: ManagementParams, env: Env): Promise<any> {
    const { action, targetType, targetId, reason, roleId } = params

    let result: any

    switch (action) {
      case 'approve':
        result = await this.approve(targetType, targetId, env)
        break
      case 'reject':
        result = await this.reject(targetType, targetId, reason, env)
        break
      case 'delete':
        result = await this.delete(targetType, targetId, reason, env)
        break
      case 'ban':
        result = await this.ban(targetId, reason, env)
        break
      case 'unban':
        result = await this.unban(targetId, env)
        break
      case 'update_role':
        result = await this.updateRole(targetId, roleId!, env)
        break
      default:
        throw new Error(`Unsupported action: ${action}`)
    }

    return {
      success: true,
      action,
      targetType,
      targetId,
      result
    }
  }

  private async approve(targetType: string, targetId: string, env: Env): Promise<any> {
    const table = targetType === 'post' ? 'posts' : 'comments'
    const now = Date.now()

    await env.DB.prepare(`
      UPDATE ${table}
      SET status = 'approved', updated_at = ?
      WHERE id = ?
    `).bind(now, targetId).run()

    return { status: 'approved' }
  }

  private async reject(targetType: string, targetId: string, reason: string | undefined, env: Env): Promise<any> {
    const table = targetType === 'post' ? 'posts' : 'comments'
    const now = Date.now()

    await env.DB.prepare(`
      UPDATE ${table}
      SET status = 'rejected', updated_at = ?
      WHERE id = ?
    `).bind(now, targetId).run()

    return { status: 'rejected', reason }
  }

  private async delete(targetType: string, targetId: string, reason: string | undefined, env: Env): Promise<any> {
    const table = targetType === 'post' ? 'posts' : 'comments'

    await env.DB.prepare(
      'DELETE FROM ?? WHERE id = ?'
    ).bind(table, targetId).run()

    return { deleted: true, reason }
  }

  private async ban(userId: string, reason: string | undefined, env: Env): Promise<any> {
    await env.DB.prepare(`
      UPDATE users
      SET status = 'banned', updated_at = ?
      WHERE id = ?
    `).bind(Date.now(), userId).run()

    return { status: 'banned', reason }
  }

  private async unban(userId: string, env: Env): Promise<any> {
    await env.DB.prepare(`
      UPDATE users
      SET status = 'active', updated_at = ?
      WHERE id = ?
    `).bind(Date.now(), userId).run()

    return { status: 'active' }
  }

  private async updateRole(userId: string, roleId: string, env: Env): Promise<any> {
    await env.DB.prepare(`
      UPDATE users
      SET role = ?, updated_at = ?
      WHERE id = ?
    `).bind(roleId, Date.now(), userId).run()

    return { role: roleId }
  }
}

// 工具注册表
export class ToolRegistry {
  private tools: Map<string, OpenClawTool> = new Map()

  constructor(env: Env, client: OpenClawClient) {
    // 注册默认工具
    this.register(new SearchTool(env, client))
    this.register(new CreateTool(env, client))
    this.register(new StatsTool(env, client))
    this.register(new ManagementTool(env, client))
  }

  register(tool: OpenClawTool): void {
    this.tools.set(tool.name, tool)
  }

  unregister(toolName: string): void {
    this.tools.delete(toolName)
  }

  get(toolName: string): OpenClawTool | undefined {
    return this.tools.get(toolName)
  }

  getAll(): OpenClawTool[] {
    return Array.from(this.tools.values())
  }

  getSchema(): any[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
  }
}

// 导出所有工具
export {
  SearchTool,
  CreateTool,
  StatsTool,
  ManagementTool,
  ToolRegistry
}