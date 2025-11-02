import { Router } from 'express';
import { asyncHandler } from '../utils/errorHandler';
import { ProtocolController } from '../controllers/protocol.controller';

const router = Router();

router.post('/initialize', asyncHandler(ProtocolController.initializeProtocol));
router.get('/state', asyncHandler(ProtocolController.getProtocolState));
router.post('/admin/transfer', asyncHandler(ProtocolController.transferProtocolAdmin));
router.post('/admin/update-fee', asyncHandler(ProtocolController.updateProtocolFeeBps));

router.post('/arcium/init-all', asyncHandler(ProtocolController.initializeArciumCompDefs));
router.post('/arcium/init-process-bet', asyncHandler(ProtocolController.initProcessBetCompDef));
router.post('/arcium/init-calculate-reward', asyncHandler(ProtocolController.initCalculateRewardCompDef));

export default router;