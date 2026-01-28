import { Router } from 'express';
import { asyncHandler } from '../utils/errorHandler';
import { ProtocolController } from '../controllers/protocol.controller';

const router = Router();

router.post('/initialize', asyncHandler(ProtocolController.initializeProtocol));
router.get('/state', asyncHandler(ProtocolController.getProtocolState));
router.post('/admin/update', asyncHandler(ProtocolController.updateProtocolFeeBps));

export default router;