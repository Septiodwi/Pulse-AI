import { z } from 'zod'

const terms = z.array(z.string().trim().min(1).max(200)).min(1).max(50).superRefine((values, context) => {
  const normalized = values.map((value) => value.toLowerCase())
  if (new Set(normalized).size !== normalized.length) context.addIssue({ code: 'custom', message: 'Keyword atau hashtag duplikat' })
})

function hashtags(values: string[]) { return values.map((value) => value.replace(/^#+/, '').trim()) }
function isoTime(value: unknown) { if (typeof value === 'number' && Number.isFinite(value)) return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString(); if (typeof value === 'string' && value.trim()) { const numeric = Number(value); const date = Number.isFinite(numeric) ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString() } return null }

export const InstagramHashtagAdapter = {
  actorId: 'apify/instagram-hashtag-scraper',
  schema: z.object({ hashtags: terms, contentType: z.enum(['posts', 'reels']), maxResultsPerHashtag: z.number().int().min(1).max(1000) }),
  toActorInput(value: unknown) { const input = this.schema.parse(value); return { hashtags: hashtags(input.hashtags), keywordSearch: false, resultsType: input.contentType, resultsLimit: input.maxResultsPerHashtag } },
  normalize(item: Record<string, unknown>, searchTerm?: string) { return { externalPostId: String(item.id ?? item.shortCode ?? item.url ?? ''), postUrl: String(item.url ?? ''), author: String(item.ownerUsername ?? item.username ?? ''), text: String(item.caption ?? ''), thumbnailUrl: String(item.displayUrl ?? item.imageUrl ?? ''), searchTerm: String(item.queryTag ?? searchTerm ?? ''), publishedAt: isoTime(item.timestamp), engagement: { likes: item.likesCount ?? null, comments: item.commentsCount ?? null, views: item.videoViewCount ?? item.videoPlayCount ?? null }, raw: item } },
}

export const TikTokHashtagAdapter = {
  actorId: 'clockworks/tiktok-hashtag-scraper',
  schema: z.object({ hashtags: terms, totalVideos: z.number().int().min(1).max(800), downloadCovers: z.boolean(), downloadSubtitles: z.boolean(), downloadSlideshows: z.boolean() }),
  toActorInput(value: unknown) { const input = this.schema.parse(value); return { hashtags: hashtags(input.hashtags), resultsPerPage: input.totalVideos, shouldDownloadCovers: input.downloadCovers, shouldDownloadSlideshowImages: input.downloadSlideshows, shouldDownloadSubtitles: input.downloadSubtitles, shouldDownloadVideos: false } },
  normalize(item: Record<string, unknown>, searchTerm?: string) { const author = item.authorMeta as Record<string, unknown> | undefined; const video = item.videoMeta as Record<string, unknown> | undefined; return { externalPostId: String(item.id ?? item.awemeId ?? item.webVideoUrl ?? ''), postUrl: String(item.webVideoUrl ?? ''), author: String(author?.name ?? item.author ?? ''), text: String(item.text ?? item.desc ?? ''), thumbnailUrl: String(video?.coverUrl ?? item.coverUrl ?? ''), searchTerm: String(searchTerm ?? ''), publishedAt: isoTime(item.createTimeISO ?? item.createTime), engagement: { likes: item.diggCount ?? null, comments: item.commentCount ?? null, shares: item.shareCount ?? null, views: item.playCount ?? null }, raw: item } },
}

export const ThreadsKeywordAdapter = {
  actorId: 'watcher.data/search-threads-by-keywords',
  schema: z.object({ keywords: terms, maxItemsPerKeyword: z.number().int().min(1).max(2000), sort: z.enum(['RECENT', 'RELEVANT']) }),
  toActorInput(value: unknown) { const input = this.schema.parse(value); return { keywords: input.keywords, maxItemsPerKeyword: input.maxItemsPerKeyword, sortByRecent: input.sort === 'RECENT', outputFormat: 'json' } },
  normalize(item: Record<string, unknown>, searchTerm?: string) { const user = item.user as Record<string, unknown> | undefined; const media = Array.isArray(item.media) ? item.media[0] as Record<string, unknown> | undefined : undefined; return { externalPostId: String(item.id ?? item.postId ?? item.url ?? ''), postUrl: String(item.url ?? item.postUrl ?? ''), author: String(item.username ?? item.author ?? user?.username ?? ''), text: String(item.text ?? item.caption ?? ''), thumbnailUrl: String(item.thumbnailUrl ?? media?.url ?? ''), searchTerm: String(item.keyword ?? searchTerm ?? ''), publishedAt: isoTime(item.timestamp ?? item.createdAt ?? item.created_at), engagement: { likes: item.likeCount ?? item.like_count ?? item.likes ?? null, replies: item.replyCount ?? item.reply_count ?? item.replies ?? null, reposts: item.repostCount ?? item.repost_count ?? item.reposts ?? null, views: item.viewCount ?? item.view_count ?? item.views ?? null }, raw: item } },
}
