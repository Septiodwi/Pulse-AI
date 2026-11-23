import { randomUUID } from 'node:crypto'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type {
  AppSettings,
  AppStore,
  AgentNewsContent,
  AgentNewsContentInput,
  AgentNewsExecution,
  AgentNewsPlatform,
  AgentNewsRecord,
  AgentNewsSourceRun,
  CreateAgentNewsInput,
  ExecutionStatus,
  CreateUserInput,
  CreateProductInput,
  ProductRecord,
  SessionRecord,
  UpdateUserInput,
  UpdateProductInput,
  UserRecord,
  UserAccess,
  UserRole,
} from '../domain.js'
import { parseLinkedAccounts } from './product-json.js'

interface UserRow extends RowDataPacket {
  id: string
  name: string
  email: string
  phone: string | null
  password_hash: string
  role: UserRole
  is_active: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  access_grants: string | UserAccess | null
}

interface ProductRow extends RowDataPacket {
  id: string
  name: string
  product_image: string
  product_image_name: string
  base_image: string
  base_image_name: string
  description: string
  product_type: string
  branding: string
  linked_accounts: string | string[]
  created_at: string
  updated_at: string
}

function mapProduct(row: ProductRow): ProductRecord {
  return { id: row.id, name: row.name, productImage: row.product_image, productImageName: row.product_image_name, baseImage: row.base_image, baseImageName: row.base_image_name, description: row.description, productType: row.product_type, branding: row.branding, linkedAccounts: parseLinkedAccounts(row.linked_accounts), createdAt: row.created_at, updatedAt: row.updated_at }
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    role: row.role,
    access: typeof row.access_grants === 'string' ? JSON.parse(row.access_grants) as UserAccess : row.access_grants ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export class MySqlStore implements AppStore {
  constructor(private readonly pool: Pool) {}

  async findUserById(id: string) {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id],
    )
    return rows[0] ? mapUser(rows[0]) : null
  }

  async findUserByEmail(email: string) {
    const [rows] = await this.pool.execute<UserRow[]>(
      'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [email.toLowerCase()],
    )
    return rows[0] ? mapUser(rows[0]) : null
  }

  async listUsers(search = '') {
    const term = `%${search}%`
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT * FROM users
       WHERE deleted_at IS NULL AND (? = '' OR name LIKE ? OR email LIKE ?)
       ORDER BY created_at DESC LIMIT 100`,
      [search, term, term],
    )
    return rows.map(mapUser)
  }

  async createUser(input: CreateUserInput) {
    const id = randomUUID()
    await this.pool.execute(
      `INSERT INTO users (id, name, email, phone, password_hash, role, is_active, access_grants)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.email.toLowerCase(),
        input.phone ?? null,
        input.passwordHash,
        input.role,
        input.isActive,
        input.access ? JSON.stringify(input.access) : null,
      ],
    )
    const user = await this.findUserById(id)
    if (!user) throw new Error('Created user could not be loaded')
    return user
  }

  async updateUser(id: string, input: UpdateUserInput) {
    const columns: string[] = []
    const values: Array<string | boolean | null> = []
    const mapping: Array<[keyof UpdateUserInput, string]> = [
      ['name', 'name'],
      ['email', 'email'],
      ['phone', 'phone'],
      ['passwordHash', 'password_hash'],
      ['role', 'role'],
      ['isActive', 'is_active'],
      ['access', 'access_grants'],
    ]

    for (const [key, column] of mapping) {
      const value = input[key]
      if (value !== undefined) {
        columns.push(`${column} = ?`)
        if (key === 'access') values.push(value === null ? null : JSON.stringify(value))
        else if (typeof value !== 'object' || value === null) {
          values.push(key === 'email' && typeof value === 'string' ? value.toLowerCase() : value)
        }
      }
    }

    if (columns.length === 0) return this.findUserById(id)
    values.push(id)
    await this.pool.execute(
      `UPDATE users SET ${columns.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
      values,
    )
    return this.findUserById(id)
  }

  async softDeleteUser(id: string) {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE users SET is_active = FALSE, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [id],
    )
    return result.affectedRows > 0
  }

  async createSession(session: SessionRecord) {
    await this.pool.execute(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [session.tokenHash, session.userId, new Date(session.expiresAt)],
    )
  }

  async findSession(tokenHash: string) {
    const [rows] = await this.pool.execute<
      Array<RowDataPacket & { token_hash: string; user_id: string; expires_at: string }>
    >('SELECT token_hash, user_id, expires_at FROM sessions WHERE token_hash = ? LIMIT 1', [
      tokenHash,
    ])
    const row = rows[0]
    return row
      ? { tokenHash: row.token_hash, userId: row.user_id, expiresAt: row.expires_at }
      : null
  }

  async deleteSession(tokenHash: string) {
    await this.pool.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash])
  }

  async deleteSessionsForUser(userId: string) {
    await this.pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId])
  }

  async getSettings() {
    const [rows] = await this.pool.execute<
      Array<
        RowDataPacket & {
          app_name: string
          timezone: string
          default_language: string
          llm_enabled: number
          llm_base_url: string
          content_concept_prompt: string | null
          content_image_prompt: string | null
          llm_model: string
          llm_api_key_encrypted: string | null
          agent_enabled: number
          agent_interval_value: number
          agent_interval_unit: AppSettings['agentIntervalUnit']
          agent_active_days: string
          agent_start_time: string
          agent_end_time: string
          tebar_enabled: number
          tebar_base_url: string
          tebar_profile: string | null
          tebar_api_key_encrypted: string | null
          apify_enabled: number
          apify_base_url: string
          apify_api_token_encrypted: string | null
        }
      >
    >(
      `SELECT app_name, timezone, default_language, llm_enabled, llm_base_url, llm_model,
              content_concept_prompt, content_image_prompt, llm_api_key_encrypted, agent_enabled, agent_interval_value,
              agent_interval_unit, agent_active_days, agent_start_time, agent_end_time,
              tebar_enabled, tebar_base_url, tebar_profile, tebar_api_key_encrypted,
              apify_enabled, apify_base_url, apify_api_token_encrypted
       FROM app_settings WHERE id = 1`,
    )
    const row = rows[0]
    if (!row) throw new Error('Application settings are missing')
    return {
      appName: row.app_name,
      timezone: row.timezone,
      defaultLanguage: row.default_language,
      llmEnabled: Boolean(row.llm_enabled),
      llmBaseUrl: row.llm_base_url,
      llmModel: row.llm_model,
      contentConceptPrompt: row.content_concept_prompt,
      contentImagePrompt: row.content_image_prompt,
      llmApiKeyEncrypted: row.llm_api_key_encrypted,
      agentEnabled: Boolean(row.agent_enabled),
      agentIntervalValue: row.agent_interval_value,
      agentIntervalUnit: row.agent_interval_unit,
      agentActiveDays: row.agent_active_days.split(',').map(Number),
      agentStartTime: row.agent_start_time,
      agentEndTime: row.agent_end_time,
      tebarEnabled: Boolean(row.tebar_enabled),
      tebarBaseUrl: row.tebar_base_url,
      tebarProfile: row.tebar_profile,
      tebarApiKeyEncrypted: row.tebar_api_key_encrypted,
      apifyEnabled: Boolean(row.apify_enabled),
      apifyBaseUrl: row.apify_base_url,
      apifyApiTokenEncrypted: row.apify_api_token_encrypted,
    }
  }

  async updateSettings(settings: AppSettings) {
    await this.pool.execute(
      `UPDATE app_settings
       SET app_name = ?, timezone = ?, default_language = ?, llm_enabled = ?,
           content_concept_prompt = ?, content_image_prompt = ?, llm_base_url = ?, llm_model = ?, llm_api_key_encrypted = ?, agent_enabled = ?,
           agent_interval_value = ?, agent_interval_unit = ?, agent_active_days = ?,
           agent_start_time = ?, agent_end_time = ?, tebar_enabled = ?, tebar_base_url = ?,
           tebar_profile = ?, tebar_api_key_encrypted = ?, apify_enabled = ?,
           apify_base_url = ?, apify_api_token_encrypted = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        settings.appName,
        settings.timezone,
        settings.defaultLanguage,
        settings.llmEnabled,
        settings.contentConceptPrompt,
        settings.contentImagePrompt,
        settings.llmBaseUrl,
        settings.llmModel,
        settings.llmApiKeyEncrypted,
        settings.agentEnabled,
        settings.agentIntervalValue,
        settings.agentIntervalUnit,
        settings.agentActiveDays.join(','),
        settings.agentStartTime,
        settings.agentEndTime,
        settings.tebarEnabled,
        settings.tebarBaseUrl,
        settings.tebarProfile,
        settings.tebarApiKeyEncrypted,
        settings.apifyEnabled,
        settings.apifyBaseUrl,
        settings.apifyApiTokenEncrypted,
      ],
    )
    return this.getSettings()
  }

  async listProducts(search = '') {
    const term = `%${search}%`
    const [rows] = await this.pool.execute<ProductRow[]>(
      `SELECT * FROM products WHERE ? = '' OR name LIKE ? OR description LIKE ? OR product_type LIKE ? OR branding LIKE ? ORDER BY created_at DESC LIMIT 200`,
      [search, term, term, term, term],
    )
    return rows.map(mapProduct)
  }

  async findProductById(id: string) {
    const [rows] = await this.pool.execute<ProductRow[]>('SELECT * FROM products WHERE id = ? LIMIT 1', [id])
    return rows[0] ? mapProduct(rows[0]) : null
  }

  async createProduct(input: CreateProductInput) {
    const id = randomUUID()
    await this.pool.execute(
      `INSERT INTO products (id, name, product_image, product_image_name, base_image, base_image_name, description, product_type, branding, linked_accounts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name, input.productImage, input.productImageName, input.baseImage, input.baseImageName, input.description, input.productType, input.branding, JSON.stringify(input.linkedAccounts)],
    )
    const product = await this.findProductById(id)
    if (!product) throw new Error('Created product could not be loaded')
    return product
  }

  async updateProduct(id: string, input: UpdateProductInput, expectedLinks?: string[]) {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE products SET name = COALESCE(?, name), product_image = COALESCE(?, product_image),
       product_image_name = COALESCE(?, product_image_name), base_image = COALESCE(?, base_image),
       base_image_name = COALESCE(?, base_image_name), description = COALESCE(?, description),
       product_type = COALESCE(?, product_type), branding = COALESCE(?, branding),
       linked_accounts = COALESCE(CAST(? AS JSON), linked_accounts), updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?${expectedLinks ? ' AND linked_accounts = CAST(? AS JSON)' : ''}`,
      [input.name ?? null, input.productImage ?? null, input.productImageName ?? null,
        input.baseImage ?? null, input.baseImageName ?? null, input.description ?? null,
        input.productType ?? null, input.branding ?? null,
        input.linkedAccounts ? JSON.stringify(input.linkedAccounts) : null, id,
        ...(expectedLinks ? [JSON.stringify(expectedLinks)] : [])],
    )
    return result.affectedRows ? this.findProductById(id) : null
  }

  async deleteProduct(id: string) {
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM products WHERE id = ?', [id])
    return result.affectedRows > 0
  }

  private async hydrateAgents(rows: Array<RowDataPacket & Record<string, unknown>>): Promise<AgentNewsRecord[]> {
    if (!rows.length) return []
    const ids = rows.map((row) => String(row.id))
    const placeholders = ids.map(() => '?').join(',')
    const [productRows] = await this.pool.execute<Array<RowDataPacket & { agent_id: string; id: string; name: string; product_image: string }>>(`SELECT ap.agent_id, p.id, p.name, p.product_image FROM agent_news_products ap JOIN products p ON p.id = ap.product_id WHERE ap.agent_id IN (${placeholders})`, ids)
    const [sourceRows] = await this.pool.execute<Array<RowDataPacket & { id: string; agent_id: string; platform: AgentNewsPlatform; actor_id: string; is_enabled: number; input_config_json: string | Record<string, unknown> }>>(`SELECT id, agent_id, platform, actor_id, is_enabled, input_config_json FROM agent_news_sources WHERE agent_id IN (${placeholders})`, ids)
    const parse = <T>(value: string | T): T => typeof value === 'string' ? JSON.parse(value) as T : value
    return rows.map((row) => ({
      id: String(row.id), name: String(row.name), description: String(row.description), status: row.status as AgentNewsRecord['status'], imageCount: Number(row.image_count), frequencyMinutes: Number(row.frequency_minutes), activeDays: String(row.active_days).split(',').map(Number), startTime: String(row.start_time), endTime: String(row.end_time), timezone: String(row.timezone), generalKeywords: parse<string[]>(row.general_keywords as string | string[]), productIds: productRows.filter((item) => item.agent_id === row.id).map((item) => item.id), products: productRows.filter((item) => item.agent_id === row.id).map((item) => ({ id: item.id, name: item.name, productImage: item.product_image })), sources: sourceRows.filter((item) => item.agent_id === row.id).map((item) => ({ id: item.id, platform: item.platform, actorId: item.actor_id, isEnabled: Boolean(item.is_enabled), config: parse<Record<string, unknown>>(item.input_config_json) })), lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null, lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null, lastExecutionStatus: row.last_execution_status as ExecutionStatus | null, nextRunAt: row.next_run_at ? new Date(String(row.next_run_at)).toISOString() : null, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }))
  }

  async listAgentNews(search = '') {
    const term = `%${search}%`
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>(`SELECT * FROM agent_news_agents WHERE ? = '' OR name LIKE ? OR description LIKE ? ORDER BY created_at DESC LIMIT 200`, [search, term, term])
    return this.hydrateAgents(rows)
  }

  async findAgentNewsById(id: string) {
    const [rows] = await this.pool.execute<Array<RowDataPacket & Record<string, unknown>>>('SELECT * FROM agent_news_agents WHERE id = ? LIMIT 1', [id])
    return (await this.hydrateAgents(rows))[0] ?? null
  }

  async createAgentNews(input: CreateAgentNewsInput) {
    const connection = await this.pool.getConnection(); const id = randomUUID()
    try { await connection.beginTransaction(); await connection.execute(`INSERT INTO agent_news_agents (id,name,description,status,frequency_minutes,image_count,active_days,start_time,end_time,timezone,general_keywords,next_run_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id,input.name,input.description,input.status,input.frequencyMinutes,input.imageCount??1,input.activeDays.join(','),input.startTime,input.endTime,input.timezone,JSON.stringify(input.generalKeywords),input.nextRunAt ? new Date(input.nextRunAt) : null,input.createdBy]); for (const productId of input.productIds) await connection.execute('INSERT INTO agent_news_products (agent_id,product_id) VALUES (?,?)',[id,productId]); for (const source of input.sources) await connection.execute('INSERT INTO agent_news_sources (id,agent_id,platform,actor_id,is_enabled,input_config_json) VALUES (?,?,?,?,?,?)',[randomUUID(),id,source.platform,source.actorId,source.isEnabled,JSON.stringify(source.config)]); await connection.commit() } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    return (await this.findAgentNewsById(id))!
  }

  async updateAgentNews(id: string, input: Partial<CreateAgentNewsInput>) {
    const current = await this.findAgentNewsById(id); if (!current) return null
    return this.replaceAgentNews(id, { name: input.name ?? current.name, description: input.description ?? current.description, status: input.status ?? current.status, imageCount: input.imageCount ?? current.imageCount, frequencyMinutes: input.frequencyMinutes ?? current.frequencyMinutes, activeDays: input.activeDays ?? current.activeDays, startTime: input.startTime ?? current.startTime, endTime: input.endTime ?? current.endTime, timezone: input.timezone ?? current.timezone, generalKeywords: input.generalKeywords ?? current.generalKeywords, productIds: input.productIds ?? current.productIds, sources: input.sources ?? current.sources.map(({ id: _id, ...source }) => source), createdBy: current.createdBy, nextRunAt: input.nextRunAt === undefined ? current.nextRunAt : input.nextRunAt })
  }

  private async replaceAgentNews(id: string, input: CreateAgentNewsInput) { const connection=await this.pool.getConnection(); try{await connection.beginTransaction();await connection.execute(`UPDATE agent_news_agents SET name=?,description=?,status=?,frequency_minutes=?,image_count=?,active_days=?,start_time=?,end_time=?,timezone=?,general_keywords=?,next_run_at=? WHERE id=?`,[input.name,input.description,input.status,input.frequencyMinutes,input.imageCount??1,input.activeDays.join(','),input.startTime,input.endTime,input.timezone,JSON.stringify(input.generalKeywords),input.nextRunAt?new Date(input.nextRunAt):null,id]);await connection.execute('DELETE FROM agent_news_products WHERE agent_id=?',[id]);for(const productId of input.productIds)await connection.execute('INSERT INTO agent_news_products (agent_id,product_id) VALUES (?,?)',[id,productId]);await connection.execute('DELETE FROM agent_news_sources WHERE agent_id=?',[id]);for(const source of input.sources)await connection.execute('INSERT INTO agent_news_sources (id,agent_id,platform,actor_id,is_enabled,input_config_json) VALUES (?,?,?,?,?,?)',[randomUUID(),id,source.platform,source.actorId,source.isEnabled,JSON.stringify(source.config)]);await connection.commit()}catch(error){await connection.rollback();throw error}finally{connection.release()}return(await this.findAgentNewsById(id))! }
  async deleteAgentNews(id: string){const[result]=await this.pool.execute<ResultSetHeader>('DELETE FROM agent_news_agents WHERE id=?',[id]);return result.affectedRows>0}
  async listDueAgentNews(now:string){const[rows]=await this.pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT * FROM agent_news_agents WHERE status='ACTIVE' AND next_run_at IS NOT NULL AND next_run_at<=? ORDER BY next_run_at LIMIT 20`,[new Date(now)]);return this.hydrateAgents(rows)}
  async createAgentNewsExecution(agentId:string,triggerType:AgentNewsExecution['triggerType']){const id=randomUUID();await this.pool.execute('INSERT INTO agent_news_executions (id,agent_id,trigger_type,status) VALUES (?,?,?,?)',[id,agentId,triggerType,'QUEUED']);return (await this.listAgentNewsExecutions(agentId)).find((item)=>item.id===id)!}
  async updateAgentNewsExecution(id:string,input:Partial<Pick<AgentNewsExecution,'status'|'startedAt'|'completedAt'|'errorMessage'>>){const current=(await this.listAgentNewsExecutions()).find((item)=>item.id===id);if(!current)return;await this.pool.execute('UPDATE agent_news_executions SET status=?,started_at=?,completed_at=?,error_message=? WHERE id=?',[input.status??current.status,input.startedAt?new Date(input.startedAt):current.startedAt,input.completedAt?new Date(input.completedAt):current.completedAt,input.errorMessage===undefined?current.errorMessage:input.errorMessage,id])}
  async listAgentNewsExecutions(agentId?:string){const[rows]=await this.pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT e.*,a.name agent_name FROM agent_news_executions e JOIN agent_news_agents a ON a.id=e.agent_id WHERE ? IS NULL OR e.agent_id=? ORDER BY e.created_at DESC LIMIT 200`,[agentId??null,agentId??null]);return rows.map((row)=>({id:String(row.id),agentId:String(row.agent_id),agentName:String(row.agent_name),triggerType:row.trigger_type as AgentNewsExecution['triggerType'],status:row.status as ExecutionStatus,startedAt:row.started_at?String(row.started_at):null,completedAt:row.completed_at?String(row.completed_at):null,errorMessage:row.error_message?String(row.error_message):null,createdAt:String(row.created_at)}))}
  async listAgentNewsSourceRuns(executionId?:string){const[rows]=await this.pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT * FROM agent_news_source_runs WHERE ? IS NULL OR execution_id=? ORDER BY created_at DESC LIMIT 500`,[executionId??null,executionId??null]);const parse=(value:unknown)=>typeof value==='string'?JSON.parse(value)as Record<string,unknown>:value as Record<string,unknown>|null;return rows.map((row)=>({id:String(row.id),executionId:String(row.execution_id),platform:row.platform as AgentNewsSourceRun['platform'],actorId:String(row.actor_id),apifyRunId:row.apify_run_id?String(row.apify_run_id):null,datasetId:row.dataset_id?String(row.dataset_id):null,status:row.status as ExecutionStatus,startedAt:row.started_at?String(row.started_at):null,completedAt:row.completed_at?String(row.completed_at):null,resultsCount:Number(row.results_count),newItemsCount:Number(row.new_items_count),duplicateItemsCount:Number(row.duplicate_items_count),errorMessage:row.error_message?String(row.error_message):null,usageMetadata:row.usage_metadata_json?parse(row.usage_metadata_json):null}))}
  async hasRunningAgentNewsExecution(agentId:string){const[rows]=await this.pool.execute<Array<RowDataPacket&{count:number}>>(`SELECT COUNT(*) count FROM agent_news_executions WHERE agent_id=? AND status IN ('QUEUED','RUNNING')`,[agentId]);return Number(rows[0]?.count)>0}
  async updateAgentNewsRuntime(agentId:string,input:{lastAttemptAt?:string;lastSuccessAt?:string;lastExecutionStatus?:ExecutionStatus;nextRunAt?:string|null}){const current=await this.findAgentNewsById(agentId);if(!current)return;await this.pool.execute('UPDATE agent_news_agents SET last_attempt_at=?,last_success_at=?,last_execution_status=?,next_run_at=? WHERE id=?',[input.lastAttemptAt?new Date(input.lastAttemptAt):current.lastAttemptAt,input.lastSuccessAt?new Date(input.lastSuccessAt):current.lastSuccessAt,input.lastExecutionStatus??current.lastExecutionStatus,input.nextRunAt===undefined?(current.nextRunAt?new Date(current.nextRunAt):null):(input.nextRunAt?new Date(input.nextRunAt):null),agentId])}
  async createAgentNewsSourceRun(input:{executionId:string;sourceId:string;actorId:string;platform:AgentNewsPlatform;status:ExecutionStatus;apifyRunId?:string|null;datasetId?:string|null}){const id=randomUUID();await this.pool.execute('INSERT INTO agent_news_source_runs (id,execution_id,source_id,actor_id,platform,status,apify_run_id,dataset_id) VALUES (?,?,?,?,?,?,?,?)',[id,input.executionId,input.sourceId,input.actorId,input.platform,input.status,input.apifyRunId??null,input.datasetId??null]);return id}
  async updateAgentNewsSourceRun(id:string,input:Record<string,unknown>){const mapping:Record<string,string>={status:'status',apifyRunId:'apify_run_id',datasetId:'dataset_id',startedAt:'started_at',completedAt:'completed_at',resultsCount:'results_count',newItemsCount:'new_items_count',duplicateItemsCount:'duplicate_items_count',errorMessage:'error_message',usageMetadata:'usage_metadata_json'};const columns:string[]=[];const values:Array<string|number|boolean|Date|null>=[];for(const[key,value]of Object.entries(input)){if(!mapping[key])continue;columns.push(`${mapping[key]}=?`);values.push(key==='usageMetadata'?JSON.stringify(value):key.endsWith('At')&&value?new Date(String(value)):value===null||['string','number','boolean'].includes(typeof value)?value as string|number|boolean|null:String(value))}if(!columns.length)return;values.push(id);await this.pool.execute(`UPDATE agent_news_source_runs SET ${columns.join(',')} WHERE id=?`,values)}
  async saveAgentNewsContents(items:AgentNewsContentInput[]){let inserted=0,duplicates=0;const insertedIds:string[]=[];const connection=await this.pool.getConnection();try{for(const item of items){const id=randomUUID();const[result]=await connection.execute<ResultSetHeader>(`INSERT IGNORE INTO agent_news_contents (id,agent_id,source_run_id,execution_id,platform,external_post_id,post_url,author,text,thumbnail_url,search_term,published_at,retrieved_at,engagement_json,raw_data_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,item.agentId,item.sourceRunId,item.executionId,item.platform,item.externalPostId,item.postUrl,item.author,item.text,item.thumbnailUrl,item.searchTerm,item.publishedAt?new Date(item.publishedAt):null,new Date(item.retrievedAt),JSON.stringify(item.engagement),JSON.stringify(item.raw)]);if(result.affectedRows){inserted++;insertedIds.push(id);for(const productId of item.productIds)await connection.execute('INSERT IGNORE INTO agent_news_content_products (content_id,product_id) VALUES (?,?)',[id,productId])}else duplicates++}}finally{connection.release()}return{inserted,duplicates,insertedIds}}
  async listAgentNewsContents(){const[rows]=await this.pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT c.*,a.name agent_name,GROUP_CONCAT(cp.product_id) product_ids FROM agent_news_contents c JOIN agent_news_agents a ON a.id=c.agent_id LEFT JOIN agent_news_content_products cp ON cp.content_id=c.id GROUP BY c.id ORDER BY c.retrieved_at DESC LIMIT 500`);const parse=<T>(value:unknown,fallback:T):T=>typeof value==='string'?JSON.parse(value)as T:(value as T)??fallback;return rows.map((row)=>({id:String(row.id),agentId:String(row.agent_id),agentName:String(row.agent_name),executionId:String(row.execution_id),platform:row.platform as AgentNewsPlatform,externalPostId:String(row.external_post_id),postUrl:row.post_url?String(row.post_url):null,author:row.author?String(row.author):null,text:row.text?String(row.text):null,thumbnailUrl:row.thumbnail_url?String(row.thumbnail_url):null,searchTerm:row.search_term?String(row.search_term):null,productIds:row.product_ids?String(row.product_ids).split(','):[],publishedAt:row.published_at?String(row.published_at):null,retrievedAt:String(row.retrieved_at),engagement:parse<Record<string,unknown>>(row.engagement_json,{}),recommendation:(row.recommendation??'PENDING')as AgentNewsContent['recommendation'],relevanceScore:row.relevance_score===null?null:Number(row.relevance_score),analysisReason:row.analysis_reason?String(row.analysis_reason):null,matchedProductIds:parse<string[]>(row.matched_product_ids_json,[]),analyzedAt:row.analyzed_at?String(row.analyzed_at):null,analysisModel:row.analysis_model?String(row.analysis_model):null}))}
  async updateAgentNewsContentAnalysis(id:string,input:Pick<AgentNewsContent,'recommendation'|'relevanceScore'|'analysisReason'|'matchedProductIds'|'analyzedAt'|'analysisModel'>){await this.pool.execute('UPDATE agent_news_contents SET recommendation=?,relevance_score=?,analysis_reason=?,matched_product_ids_json=?,analyzed_at=?,analysis_model=? WHERE id=?',[input.recommendation,input.relevanceScore,input.analysisReason,JSON.stringify(input.matchedProductIds),input.analyzedAt?new Date(input.analyzedAt):null,input.analysisModel,id])}
}
