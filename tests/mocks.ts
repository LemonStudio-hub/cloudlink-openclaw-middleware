/**
 * 测试模拟工具
 * 用于模拟 D1 数据库、KV 存储、队列等
 */

import { vi } from 'vitest'

// 模拟 D1 语句结果
export interface MockD1StatementResult {
  results?: any[]
  meta?: {
    rows_read: number
    rows_written: number
    last_row_id?: number
  }
}

// 模拟 D1 数据库
export class MockD1Database {
  private data: Map<string, any[]> = new Map()
  private sequences: Map<string, number> = new Map()

  constructor() {
    // 初始化一些表数据
    this.data.set('users', [])
    this.data.set('devices', [])
    this.data.set('sessions', [])
    this.data.set('posts', [])
    this.data.set('comments', [])
    this.data.set('categories', [])
    this.data.set('tags', [])
    this.data.set('notifications', [])
  }

  prepare(sql: string) {
    return {
      bind: (...params: any[]) => {
        return {
          bind: (...moreParams: any[]) => {
            return this.execute(sql, [...params, ...moreParams])
          },
          first: async () => {
            const result = await this.execute(sql, params)
            return result.results?.[0] || null
          },
          all: async () => {
            return await this.execute(sql, params)
          },
          run: async () => {
            return await this.execute(sql, params)
          }
        }
      }
    }
  }

  private async execute(sql: string, params: any[]): Promise<MockD1StatementResult> {
    const lowerSql = sql.toLowerCase()
    
    // INSERT 操作
    if (lowerSql.includes('insert into')) {
      const tableName = this.extractTableName(sql)
      const table = this.data.get(tableName)
      if (table) {
        const record = this.parseInsertValues(sql, params)
        record.id = record.id || this.generateId(tableName)
        table.push(record)
        return {
          meta: {
            rows_read: 0,
            rows_written: 1,
            last_row_id: record.id
          }
        }
      }
    }
    
    // UPDATE 操作
    if (lowerSql.includes('update')) {
      const tableName = this.extractTableName(sql)
      const table = this.data.get(tableName)
      if (table) {
        const updated = this.executeUpdate(sql, params, table)
        return {
          meta: {
            rows_read: updated.length,
            rows_written: updated.length
          }
        }
      }
    }
    
    // DELETE 操作
    if (lowerSql.includes('delete')) {
      const tableName = this.extractTableName(sql)
      const table = this.data.get(tableName)
      if (table) {
        const deleted = this.executeDelete(sql, params, table)
        return {
          meta: {
            rows_read: deleted.length,
            rows_written: deleted.length
          }
        }
      }
    }
    
    // SELECT 操作
    if (lowerSql.includes('select')) {
      const tableName = this.extractTableName(sql)
      const table = this.data.get(tableName)
      if (table) {
        const results = this.executeSelect(sql, params, table)
        return {
          results,
          meta: {
            rows_read: results.length,
            rows_written: 0
          }
        }
      }
    }
    
    return {
      results: [],
      meta: { rows_read: 0, rows_written: 0 }
    }
  }

  private extractTableName(sql: string): string {
    const match = sql.match(/(?:insert into|update|delete from|from)\s+(\w+)/i)
    return match ? match[1] : ''
  }

  private parseInsertValues(sql: string, params: any[]): any {
    const columns = sql.match(/insert into \w+\s*\(([^)]+)\)/i)
    if (columns) {
      const columnNames = columns[1].split(',').map(c => c.trim())
      const record: any = {}
      columnNames.forEach((name, i) => {
        record[name] = params[i]
      })
      return record
    }
    return {}
  }

  private executeUpdate(sql: string, params: any[], table: any[]): any[] {
    const idMatch = sql.match(/where id = \?/i)
    if (idMatch && params.length > 0) {
      const id = params[params.length - 1]
      const record = table.find(r => r.id === id)
      if (record) {
        const setMatch = sql.match(/set\s+(.+?)\s+where/i)
        if (setMatch) {
          const setClauses = setMatch[1].split(',')
          setClauses.forEach((clause, i) => {
            const [col] = clause.split('=').map(s => s.trim())
            if (i < params.length - 1) {
              record[col] = params[i]
            }
          })
        }
        return [record]
      }
    }
    return []
  }

  private executeDelete(sql: string, params: any[], table: any[]): any[] {
    const idMatch = sql.match(/where id = \?/i)
    if (idMatch && params.length > 0) {
      const id = params[params.length - 1]
      const index = table.findIndex(r => r.id === id)
      if (index !== -1) {
        return table.splice(index, 1)
      }
    }
    return []
  }

  private executeSelect(sql: string, params: any[], table: any[]): any[] {
    let results = [...table]
    
    // 简单的 WHERE 条件处理
    const whereMatch = sql.match(/where\s+(.+?)(?:\s+order by|\s+limit|\s+group by|$)/i)
    if (whereMatch && params.length > 0) {
      const conditions = whereMatch[1].split('and')
      conditions.forEach((cond, i) => {
        if (i < params.length) {
          const [col] = cond.match(/(\w+)/) || []
          if (col) {
            results = results.filter(r => r[col] === params[i])
          }
        }
      })
    }
    
    // 处理 JOIN
    if (sql.toLowerCase().includes('join')) {
      results = this.handleJoins(sql, results)
    }
    
    // 处理 ORDER BY
    const orderMatch = sql.match(/order by\s+(\w+)\s*(desc|asc)?/i)
    if (orderMatch) {
      const col = orderMatch[1]
      const direction = (orderMatch[2] || 'asc').toLowerCase()
      results.sort((a, b) => {
        if (direction === 'desc') {
          return b[col] > a[col] ? 1 : -1
        }
        return a[col] > b[col] ? 1 : -1
      })
    }
    
    // 处理 LIMIT 和 OFFSET
    const limitMatch = sql.match(/limit\s+(\d+)/i)
    const offsetMatch = sql.match(/offset\s+(\d+)/i)
    if (offsetMatch) {
      results = results.slice(parseInt(offsetMatch[1]))
    }
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]))
    }
    
    return results
  }

  private handleJoins(sql: string, results: any[]): any[] {
    // 简化的 JOIN 处理
    const joinMatch = sql.match(/join\s+(\w+)\s+on\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i)
    if (joinMatch) {
      const [, joinTable, leftTable, leftCol, rightTable, rightCol] = joinMatch
      const joinData = this.data.get(joinTable) || []
      
      return results.map(row => {
        const joined = joinData.find(j => j[rightCol] === row[leftCol])
        return {
          ...row,
          [joinTable]: joined || {}
        }
      })
    }
    return results
  }

  private generateId(tableName: string): string {
    const seq = this.sequences.get(tableName) || 0
    this.sequences.set(tableName, seq + 1)
    return `${tableName.substring(0, 3)}-${seq + 1}`
  }

  // 添加测试数据
  addTestData(tableName: string, data: any[]): void {
    const table = this.data.get(tableName)
    if (table) {
      table.push(...data)
    }
  }

  // 清空表
  clearTable(tableName: string): void {
    const table = this.data.get(tableName)
    if (table) {
      table.length = 0
    }
  }

  // 获取表数据
  getTable(tableName: string): any[] {
    return this.data.get(tableName) || []
  }
}

// 模拟 KV 存储
export class MockKVNamespace {
  private data: Map<string, { value: string; expiration?: number }> = new Map()

  async get(key: string, options?: { type?: 'text' | 'json' }): Promise<any> {
    const item = this.data.get(key)
    if (!item) {
      return null
    }
    
    if (item.expiration && item.expiration < Date.now()) {
      this.data.delete(key)
      return null
    }
    
    if (options?.type === 'json') {
      return JSON.parse(item.value)
    }
    return item.value
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiration = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined
    this.data.set(key, { value, expiration })
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  // 清空所有数据
  clear(): void {
    this.data.clear()
  }

  // 获取所有键
  keys(): string[] {
    return Array.from(this.data.keys())
  }
}

// 模拟队列
export class MockQueue<T> {
  private messages: T[] = []

  async send(message: T): Promise<void> {
    this.messages.push(message)
  }

  async sendBatch(messages: T[]): Promise<void> {
    this.messages.push(...messages)
  }

  // 获取所有消息
  getMessages(): T[] {
    return [...this.messages]
  }

  // 清空队列
  clear(): void {
    this.messages.length = 0
  }
}

// 创建模拟环境
export function createMockEnv(): any {
  return {
    OPENCLAW_GATEWAY_URL: 'ws://localhost:18789',
    OPENCLAW_AUTH_TOKEN: 'test-token',
    OPENCLAW_DEVICE_ID: 'test-device',
    OPENCLAW_CHANNELS: 'slack,discord',
    OPENCLAW_THINKING: 'medium',
    OPENCLAW_RATE_LIMIT: '100',
    OPENCLAW_RATE_WINDOW: '60',
    DB: new MockD1Database(),
    KV: new MockKVNamespace(),
    OPENCLAW_QUEUE: new MockQueue<any>()
  }
}

// 创建模拟的 OpenClaw 客户端
export function createMockClient(): any {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendAgentMessage: vi.fn().mockResolvedValue({ success: true }),
    getState: vi.fn().mockReturnValue({
      connected: true,
      authenticated: true
    })
  }
}

// 辅助函数：创建模拟的语句
export function createMockStatement(options: {
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