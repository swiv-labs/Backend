import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './utils/errorHandler';
import { successResponse } from './utils/response';

// Import routes
import usersRoutes from './routes/users.routes';
import poolsRoutes from './routes/pools.routes';
import predictionsRoutes from './routes/predictions.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import statsRoutes from './routes/stats.routes';
import protocolRoutes from './routes/protocol.routes';
import waitlistRoutes from './routes/waitlist.routes';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req: Request, res: Response) => {
  successResponse(res, 'Swiv API is up and running', {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

app.get('/health', (req: Request, res: Response) => {
  successResponse(res, 'Swiv API is up and running', {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// API Routes
app.use('/api/protocol', protocolRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/pools', poolsRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/waitlist', waitlistRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

// Global error handler
app.use(errorHandler);

export default app;