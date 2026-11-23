import { describe, expect, it, vi } from 'vitest'
import { InstagramHashtagAdapter, ThreadsKeywordAdapter, TikTokHashtagAdapter } from '../src/agent-news/adapters.js'
import { ApifyClient } from '../src/agent-news/apify-client.js'
import { AgentNewsExecutor, isWithinMonitoringWindow } from '../src/agent-news/executor.js'
import { AgentNewsContentAnalyzer } from '../src/agent-news/content-analyzer.js'
import { calculateNextRun } from '../src/agent-news/schedule.js'
import { MemoryStore } from '../src/store/memory-store.js'
import { encryptSecret } from '../src/security/encrypted-secret.js'

describe('Agent News adapters', () => {
  it('analyzes new monitoring data against selected product profiles using Settings LLM', async () => {
    const key=Buffer.alloc(32,6).toString('base64');const store=new MemoryStore();const product=await store.createProduct({name:'AceKid',productImage:'data:image/png;base64,AA==',productImageName:'a.png',baseImage:'data:image/png;base64,AA==',baseImageName:'b.png',description:'Susu pertumbuhan anak',productType:'Nutrisi',branding:'Mendukung tumbuh kembang',linkedAccounts:[]});const settings=await store.getSettings();await store.updateSettings({...settings,llmEnabled:true,llmBaseUrl:'https://llm.test/v1',llmModel:'pulse-model',llmApiKeyEncrypted:encryptSecret('secret',key)});const agent=await store.createAgentNews({name:'AI',description:'AI analysis',status:'ACTIVE',frequencyMinutes:60,activeDays:[1],startTime:'08:00',endTime:'20:00',timezone:'Asia/Jakarta',generalKeywords:[],productIds:[product.id],createdBy:'user',nextRunAt:null,sources:[]});const saved=await store.saveAgentNewsContents([{agentId:agent.id,executionId:'execution',sourceRunId:'source',platform:'INSTAGRAM',externalPostId:'post',postUrl:null,author:'author',text:'Tips nutrisi untuk tumbuh kembang anak',thumbnailUrl:null,searchTerm:'nutrisi anak',productIds:[product.id],publishedAt:null,retrievedAt:new Date().toISOString(),engagement:{},raw:{}}]);const fetcher=vi.fn(async(_url:string,options?:RequestInit)=>{expect((options?.headers as Record<string,string>).authorization).toBe('Bearer secret');expect(String(options?.body)).toContain('Memantau tren nutrisi anak');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({results:[{contentId:saved.insertedIds[0],recommendation:'RECOMMENDED',relevanceScore:92,reason:'Sangat relevan dengan nutrisi anak.',matchedProductIds:[product.id]}]})}}]}))})as unknown as typeof fetch
    await new AgentNewsContentAnalyzer(store,key,fetcher).analyze(saved.insertedIds,[product.id],'Memantau tren nutrisi anak')
    expect((await store.listAgentNewsContents())[0]).toMatchObject({recommendation:'RECOMMENDED',relevanceScore:92,matchedProductIds:[product.id],analysisModel:'pulse-model'})
  })

  it('only accepts posts published inside the configured monitoring window', () => {
    const retrieved='2026-11-23T09:00:00.000Z'
    expect(isWithinMonitoringWindow('2026-11-23T08:45:00.000Z',retrieved,15)).toBe(true)
    expect(isWithinMonitoringWindow('2026-11-23T08:44:59.999Z',retrieved,15)).toBe(false)
    expect(isWithinMonitoringWindow('2026-11-23T09:00:00.001Z',retrieved,15)).toBe(false)
    expect(isWithinMonitoringWindow(null,retrieved,15)).toBe(false)
    expect(isWithinMonitoringWindow('invalid',retrieved,15)).toBe(false)
  })

  it('builds source-specific Instagram input without joining hashtags', () => {
    expect(InstagramHashtagAdapter.toActorInput({ hashtags: ['#AceKid', 'SusuAnak'], contentType: 'posts', maxResultsPerHashtag: 50 })).toEqual({ hashtags: ['AceKid', 'SusuAnak'], keywordSearch: false, resultsType: 'posts', resultsLimit: 50 })
  })

  it('builds TikTok input with video downloads disabled', () => {
    expect(TikTokHashtagAdapter.toActorInput({ hashtags: ['AceKid'], totalVideos: 100, downloadCovers: true, downloadSubtitles: false, downloadSlideshows: false })).toEqual({ hashtags: ['AceKid'], resultsPerPage: 100, shouldDownloadCovers: true, shouldDownloadSlideshowImages: false, shouldDownloadSubtitles: false, shouldDownloadVideos: false })
  })

  it('builds Threads input and rejects duplicate terms', () => {
    expect(ThreadsKeywordAdapter.toActorInput({ keywords: ['AceKid', 'nutrisi anak'], maxItemsPerKeyword: 50, sort: 'RECENT' })).toEqual({ keywords: ['AceKid', 'nutrisi anak'], maxItemsPerKeyword: 50, sortByRecent: true, outputFormat: 'json' })
    expect(() => ThreadsKeywordAdapter.toActorInput({ keywords: ['AceKid', 'acekid'], maxItemsPerKeyword: 50, sort: 'RELEVANT' })).toThrow()
  })

  it('normalizes platform records without fabricating missing metrics', () => {
    expect(InstagramHashtagAdapter.normalize({ shortCode:'ig1', ownerUsername:'owner', caption:'caption', displayUrl:'image', timestamp:'2026-01-01', likesCount:2, commentsCount:1, videoPlayCount:3 }, 'AceKid')).toMatchObject({ externalPostId:'ig1', author:'owner', engagement:{ likes:2, comments:1, views:3 } })
    expect(TikTokHashtagAdapter.normalize({ awemeId:'tt1', desc:'video', coverUrl:'cover', author:'creator' }, 'Parenting')).toMatchObject({ externalPostId:'tt1', author:'creator', text:'video', searchTerm:'Parenting', engagement:{ likes:null, comments:null, shares:null, views:null } })
    expect(ThreadsKeywordAdapter.normalize({ postId:'th1', postUrl:'url', caption:'thread', user:{ username:'threader' }, createdAt:'2026-01-01' }, 'nutrisi')).toMatchObject({ externalPostId:'th1', author:'threader', text:'thread', publishedAt:'2026-01-01T00:00:00.000Z' })
    expect(ThreadsKeywordAdapter.normalize({ id:'th2',author:'creator',text:'thread',created_at:1795435813,like_count:4,reply_count:2,view_count:10 },'brand')).toMatchObject({externalPostId:'th2',author:'creator',publishedAt:'2026-11-23T12:10:13.000Z',engagement:{likes:4,replies:2,views:10}})
  })

  it('calculates a next run for schedules that cross midnight', () => {
    const next = calculateNextRun({ frequencyMinutes: 60, activeDays: [1, 2, 3, 4, 5, 6, 0], startTime: '22:00', endTime: '06:00', timezone: 'Asia/Jakarta' }, new Date('2026-11-23T16:30:00.000Z'))
    expect(next).toBe('2026-11-23T17:30:00.000Z')
  })

  it('calculates same-day schedules and returns null when no active day exists', () => {
    expect(calculateNextRun(
      { frequencyMinutes: 30, activeDays: [1], startTime: '08:00', endTime: '10:00', timezone: 'Asia/Jakarta' },
      new Date('2026-11-23T00:30:00.000Z'),
    )).toBe('2026-11-23T01:00:00.000Z')

    expect(calculateNextRun(
      { frequencyMinutes: 60, activeDays: [], startTime: '08:00', endTime: '10:00', timezone: 'Asia/Jakarta' },
      new Date('2026-11-23T00:00:00.000Z'),
    )).toBeNull()
  })

  it('uses the previous active day after midnight for crossing schedules', () => {
    expect(calculateNextRun(
      { frequencyMinutes: 30, activeDays: [1], startTime: '22:00', endTime: '02:00', timezone: 'Asia/Jakarta' },
      new Date('2026-11-23T17:00:00.000Z'),
    )).toBe('2026-11-23T17:30:00.000Z')
  })

  it('uses authenticated Apify run and dataset endpoints', async () => {
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      expect((options?.headers as Record<string, string>).authorization).toBe('Bearer token')
      if (url.includes('/runs')) return new Response(JSON.stringify({ data: { id: 'run-1', status: 'READY' } }))
      if (url.includes('/actor-runs/')) return new Response(JSON.stringify({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'dataset-1' } }))
      return new Response(JSON.stringify([{ id: 'post-1' }]))
    }) as unknown as typeof fetch
    const client = new ApifyClient('https://api.apify.com/v2/', 'token', fetcher)
    expect((await client.startActor('apify/test', { value: true })).id).toBe('run-1')
    expect((await client.waitForRun('run-1')).status).toBe('SUCCEEDED')
    expect(await client.getDatasetItems('dataset-1')).toEqual([{ id: 'post-1' }])
  })

  it('maps Apify authentication and rate-limit failures', async () => {
    const unauthorized = new ApifyClient('https://api.apify.com/v2', 'bad', vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch)
    await expect(unauthorized.getRun('run')).rejects.toThrow('APIFY_INVALID_TOKEN')
    const limited = new ApifyClient('https://api.apify.com/v2', 'token', vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch)
    await expect(limited.getRun('run')).rejects.toThrow('APIFY_RATE_LIMIT')
    const failed = new ApifyClient('https://api.apify.com/v2', 'token', vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch)
    await expect(failed.getRun('run')).rejects.toThrow('APIFY_HTTP_500')
    await expect(new ApifyClient('https://api.apify.com/v2', 'token', vi.fn() as unknown as typeof fetch).waitForRun('run', 0)).rejects.toThrow('APIFY_TIMEOUT')
  })

  it('returns terminal failed Actor runs without waiting for a timeout', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'run', status: 'FAILED' } }))) as unknown as typeof fetch
    await expect(new ApifyClient('https://api.apify.com/v2', 'token', fetcher).waitForRun('run')).resolves.toMatchObject({ status: 'FAILED' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('paginates datasets larger than one thousand records', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('offset=0') ? Array.from({ length: 1000 }, (_, id) => ({ id })) : [{ id: 1000 }]))) as unknown as typeof fetch
    expect(await new ApifyClient('https://api.apify.com/v2', 'token', fetcher).getDatasetItems('dataset')).toHaveLength(1001)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('executes enabled sources, stores data, and deduplicates repeated posts', async () => {
    const key = Buffer.alloc(32, 9).toString('base64')
    const store = new MemoryStore()
    const product = await store.createProduct({ name: 'AceKid', productImage: 'data:image/png;base64,AA==', productImageName: 'a.png', baseImage: 'data:image/png;base64,AA==', baseImageName: 'b.png', description: 'Produk', productType: 'Nutrisi', branding: 'AceKid', linkedAccounts: [] })
    const settings = await store.getSettings(); await store.updateSettings({ ...settings, apifyApiTokenEncrypted: encryptSecret('token', key) })
    const agent = await store.createAgentNews({ name: 'Monitor', description: 'Monitor test', status: 'ACTIVE', frequencyMinutes: 60, activeDays: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '23:59', timezone: 'Asia/Jakarta', generalKeywords: [], productIds: [product.id], createdBy: 'user-id', nextRunAt: null, sources: [{ platform: 'INSTAGRAM', actorId: InstagramHashtagAdapter.actorId, isEnabled: true, config: { hashtags: ['AceKid'], contentType: 'posts', maxResultsPerHashtag: 10 } }] })
    class FakeClient extends ApifyClient { constructor(){super('', '')} override async startActor(){return { id:'run', status:'READY' }} override async waitForRun(){return { id:'run', status:'SUCCEEDED', defaultDatasetId:'dataset' }} override async getDatasetItems(){const timestamp=new Date().toISOString();return [{ id:'post-1', url:'https://example.com/p/1', caption:'AceKid', ownerUsername:'author',timestamp }, { id:'post-1', url:'https://example.com/p/1', caption:'AceKid', ownerUsername:'author',timestamp }] } }
    const executor = new AgentNewsExecutor(store, key, () => new FakeClient())
    await executor.enqueue(agent.id, 'MANUAL')
    await vi.waitFor(async () => expect((await store.listAgentNewsExecutions(agent.id))[0]?.status).toBe('SUCCESS'))
    expect(await store.listAgentNewsContents()).toHaveLength(1)
    expect((await store.listAgentNewsSourceRuns())[0]).toMatchObject({ resultsCount: 2, newItemsCount: 1, duplicateItemsCount: 1 })
    await expect(executor.enqueue(agent.id, 'MANUAL')).rejects.toMatchObject({ status: 429 })
  })

  it('reports partial success without discarding successful source data', async () => {
    const key = Buffer.alloc(32, 8).toString('base64'); const store = new MemoryStore(); const settings = await store.getSettings(); await store.updateSettings({ ...settings, apifyApiTokenEncrypted: encryptSecret('token', key) })
    const agent = await store.createAgentNews({ name:'Mixed',description:'Mixed sources',status:'ACTIVE',frequencyMinutes:60,activeDays:[0,1,2,3,4,5,6],startTime:'00:00',endTime:'23:59',timezone:'Asia/Jakarta',generalKeywords:[],productIds:[],createdBy:'user',nextRunAt:null,sources:[{platform:'INSTAGRAM',actorId:InstagramHashtagAdapter.actorId,isEnabled:true,config:{hashtags:['ok'],contentType:'posts',maxResultsPerHashtag:1}},{platform:'THREADS',actorId:ThreadsKeywordAdapter.actorId,isEnabled:true,config:{keywords:['fail'],maxItemsPerKeyword:1,sort:'RECENT'}}] })
    class MixedClient extends ApifyClient { constructor(){super('','')} override async startActor(actorId:string){if(actorId.includes('threads'))throw new Error('APIFY_RATE_LIMIT');return{id:'ok',status:'READY'}} override async waitForRun(){return{id:'ok',status:'SUCCEEDED',defaultDatasetId:'dataset'}} override async getDatasetItems(){return[{id:'saved',timestamp:new Date().toISOString()}]} }
    await new AgentNewsExecutor(store,key,()=>new MixedClient()).enqueue(agent.id,'SCHEDULED')
    await vi.waitFor(async()=>expect((await store.listAgentNewsExecutions(agent.id))[0]?.status).toBe('PARTIAL_SUCCESS'))
    expect(await store.listAgentNewsContents()).toHaveLength(1)
    expect((await store.listAgentNewsSourceRuns()).find(run=>run.platform==='THREADS')?.errorMessage).toContain('Batas permintaan')
  })

  it('marks an execution failed and maps timeout plus generic Actor errors', async () => {
    const key = Buffer.alloc(32, 7).toString('base64'); const store = new MemoryStore(); const settings = await store.getSettings(); await store.updateSettings({ ...settings, apifyApiTokenEncrypted: encryptSecret('token', key) })
    const agent = await store.createAgentNews({ name:'Failed',description:'All sources fail',status:'ACTIVE',frequencyMinutes:60,activeDays:[0,1,2,3,4,5,6],startTime:'00:00',endTime:'23:59',timezone:'Asia/Jakarta',generalKeywords:[],productIds:[],createdBy:'user',nextRunAt:null,sources:[{platform:'INSTAGRAM',actorId:InstagramHashtagAdapter.actorId,isEnabled:true,config:{hashtags:['timeout'],contentType:'posts',maxResultsPerHashtag:1}},{platform:'THREADS',actorId:ThreadsKeywordAdapter.actorId,isEnabled:true,config:{keywords:['failed'],maxItemsPerKeyword:1,sort:'RECENT'}}] })
    class FailedClient extends ApifyClient { constructor(){super('','')} override async startActor(actorId:string){throw new Error(actorId.includes('instagram') ? 'APIFY_TIMEOUT' : 'ACTOR_FAILED')} }
    await new AgentNewsExecutor(store,key,()=>new FailedClient()).enqueue(agent.id,'SCHEDULED')
    await vi.waitFor(async()=>expect((await store.listAgentNewsExecutions(agent.id))[0]?.status).toBe('FAILED'))
    const runs = await store.listAgentNewsSourceRuns()
    expect(runs.find(run=>run.platform==='INSTAGRAM')?.errorMessage).toContain('melewati batas waktu')
    expect(runs.find(run=>run.platform==='THREADS')?.errorMessage).toContain('Periksa riwayat')
    expect((await store.findAgentNewsById(agent.id))?.lastSuccessAt).toBeNull()
  })

  it('refuses execution when Apify is not configured', async () => {
    const store = new MemoryStore(); const agent = await store.createAgentNews({ name:'No token',description:'No token config',status:'ACTIVE',frequencyMinutes:60,activeDays:[1],startTime:'08:00',endTime:'20:00',timezone:'Asia/Jakarta',generalKeywords:[],productIds:[],createdBy:'user',nextRunAt:null,sources:[] })
    await expect(new AgentNewsExecutor(store,Buffer.alloc(32).toString('base64')).enqueue(agent.id,'MANUAL')).rejects.toMatchObject({ status: 400 })
  })

  it('refuses Get Now while an agent is nonaktif', async () => {
    const store=new MemoryStore();const agent=await store.createAgentNews({name:'Paused',description:'Paused agent',status:'PAUSED',frequencyMinutes:60,activeDays:[1],startTime:'08:00',endTime:'20:00',timezone:'Asia/Jakarta',generalKeywords:[],productIds:[],createdBy:'user',nextRunAt:null,sources:[]})
    await expect(new AgentNewsExecutor(store,Buffer.alloc(32).toString('base64')).enqueue(agent.id,'MANUAL')).rejects.toMatchObject({status:409})
  })

  it('supports memory-store update, due schedule, and missing-resource paths', async () => {
    const store = new MemoryStore()
    expect(await store.findAgentNewsById('missing')).toBeNull()
    expect(await store.updateAgentNews('missing', { name:'Nope' })).toBeNull()
    expect(await store.deleteAgentNews('missing')).toBe(false)
    const agent = await store.createAgentNews({ name:'Due',description:'Due agent',status:'ACTIVE',frequencyMinutes:30,activeDays:[1],startTime:'08:00',endTime:'20:00',timezone:'Asia/Jakarta',generalKeywords:['A'],productIds:[],createdBy:'user',nextRunAt:'2026-01-01T00:00:00.000Z',sources:[] })
    expect(await store.listDueAgentNews('2026-01-02T00:00:00.000Z')).toHaveLength(1)
    expect((await store.updateAgentNews(agent.id, { status:'PAUSED', generalKeywords:['B'], activeDays:[2], sources:[] }))?.status).toBe('PAUSED')
    await store.updateAgentNewsExecution('missing', { status:'FAILED' })
    await store.updateAgentNewsSourceRun('missing', { status:'FAILED' })
    await store.updateAgentNewsRuntime('missing', { lastExecutionStatus:'FAILED' })
  })
})
