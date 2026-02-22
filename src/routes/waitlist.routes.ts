import { Router } from 'express';
import { WaitlistController } from '../controllers/waitlist.controller';
import { validateRequest } from '../utils/validator';
import { asyncHandler } from '../utils/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schema for joining waitlist
const joinWaitlistSchema = Joi.object({
  xUsername: Joi.string().required().messages({
    'string.empty': 'X username is required',
    'any.required': 'X username is required',
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
});

// Join waitlist
router.post(
  '/join',
  validateRequest(joinWaitlistSchema),
  asyncHandler(WaitlistController.join)
);

// Get all waitlist entries (admin)
router.get(
  '/',
  asyncHandler(WaitlistController.getAll)
);

// Get waitlist stats
router.get(
  '/stats',
  asyncHandler(WaitlistController.getStats)
);

export default router;
