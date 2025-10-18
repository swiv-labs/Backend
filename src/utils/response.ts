import { Response } from 'express';

export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message: string;
  data?: T;
  error?: any;
}

export const successResponse = <T>(
  res: Response,
  message: string,
  data?: T,
  statusCode: number = 200
): Response => {
  const response: ApiResponse<T> = {
    status: 'success',
    message,
    data,
  };
  return res.status(statusCode).json(response);
};

export const errorResponse = (
  res: Response,
  message: string,
  error?: any,
  statusCode: number = 400
): Response => {
  const response: ApiResponse = {
    status: 'error',
    message,
    error: error?.message || error,
  };
  return res.status(statusCode).json(response);
};