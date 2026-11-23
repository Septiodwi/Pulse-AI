import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      success: false,
      error: { message: 'Data tidak valid', details: error.issues },
    })
    return
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({ success: false, error: { message: error.message } })
    return
  }

  console.error(error)
  response.status(500).json({ success: false, error: { message: 'Terjadi kesalahan internal' } })
}
