const express = require('express');
const router  = express.Router();
const zc      = require('../controllers/miscControllers');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/',                 zc.getAllZones);
router.put('/:id/risk',         authenticate, authorize('admin'), zc.updateRiskScore);

module.exports = router;
